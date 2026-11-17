// in-app alerts center: the header bell, the alerts sheet, dismiss / snooze, the supervisor's alert settings
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)

// The rules are UMCore.alertsFor (pure, unit-tested in tests/core.test.js).
// This file gathers what only this phone knows, read with the very functions
// v122's own bars and notes use — never a rule of its own: the queue as the
// pill counts it (outboxWaiting → outboxList, memory included), what the red
// bar of a full phone says (memOnlyLines, _memOnly), each visible visit's
// photo note (photoWaitInfo, 12-reports.js: waiting, only in the app's memory,
// lost, another phone's photo with its age), the sales files' retry bar
// (_erpDirty), the last sales import (lastErpImport, 11-erp.js), today's
// backup (um_snapDay / um_snapFail, maybeSnapshot) — keeps each
// person's dismiss / snooze on this device, and draws the bell and the sheet.
// The supervisor's on/off per type and the hours / limits live in
// BENCHMARKS.alerts, saved through persist('benchmarks') like the KPI
// settings; a rep can neither open nor save them. Nothing here reads the
// cloud: the bell costs no download.
const ALERT_STATE = 'um_alerts:';   // + the person's name → { dismissed: {id: day}, snoozed: {id: ms} }
const ALERT_SHOW_MAX = 8;           // list lines shown per card; "+N more" after them
const ALERT_ICON = { overdue: 'calendar', missed: 'clipboard', request: 'chat', noActivity: 'users', target: 'target', drop: 'chart', sync: 'refresh', erpImport: 'download', backup: 'shield' };
const ALERT_TYPE_INFO = {
  overdue: ['Overdue follow-ups', 'Clinics whose follow-up date has passed: each person her own, the supervisor everyone\'s.'],
  missed: ['Missed planned visits', 'Planned in the last 14 days, not visited on the day nor since.'],
  request: ['Client requests not answered in time', "Open client requests (More → Requests, escalations & stands) not marked answered within the hours of the KPI settings — the KPI scorecard's rule."],
  noActivity: ['No field visit by a set hour', 'Supervisor only: a person with no field visit logged today by the hour below, on working days.'],
  target: ['Month target at risk', "The month figure (ERP files) below 90% of an even pace in working days to the ERP cut-off — the sales coach's rule; a target from an earlier month is named."],
  drop: ['Customers buying less than last month', 'Invoiced sales in the ERP files from day 1 to the cut-off, against the same days of last month.'],
  sync: ['Sync problems', "What the sync bars and the visit photo notes say: changes waiting to upload, changes kept on this phone and not sent, a change the cloud refused, anything only in the app's memory, visit photos waiting or lost, sales file changes not saved."],
  erpImport: ['Failed sales file import', 'Supervisor only: the last import on this phone failed.'],
  backup: ['Daily backup', 'Supervisor only: today\'s backup could not be saved, or is not confirmed after the hour below.'],
};
const ALERT_NUMBERS = [
  ['noActivityHour', 'No field visit by (hour, 0–23)', 1],
  ['targetMinDays', 'Judge the target pace from working day', 1],
  ['dropPct', 'Customer down by at least (%)', 1],
  ['dropMinKD', 'Customer bought at least (KD, same days last month)', 0.01],
  ['outboxMinutes', 'Changes and photos waiting longer than (minutes)', 1],
  ['backupHour', 'Ask about today\'s backup after (hour, 0–23)', 1],
];
let _alerts = { shown: [], hidden: [] };   // the last computed lists: the bell and the sheet show the same
let _alertsSig = '';
const _alertsCache = {};                   // UMCore.alertsFor's: the sales rules rerun only when what they read changed
let _alertsShowHidden = false;

function alertsStateKey(){ return ALERT_STATE + (currentUser ? currentUser.name : ''); }
function alertsJSON(key){ try{ const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }catch(e){ return null; } }
function alertsState(){ return alertsJSON(alertsStateKey()) || {}; }
function alertsStateSave(st){ try{ localStorage.setItem(alertsStateKey(), JSON.stringify(st)); return true; }catch(e){ return false; } }
// Each visible visit's photo note (photoWaitInfo — the note's own reading and
// lines), for the visits this person sees (visibleVisits: a rep's own and the
// ones she was on; the supervisor's, everyone's).
function alertsPhotoFacts(){
  if(typeof photoWaitInfo !== 'function') return [];
  const out = [], onList = new Set(clinics.map(c => c && c.id));
  visibleVisits().forEach(v => {
    if(!v || !Array.isArray(v.photos) || !v.photos.length) return;
    const w = photoWaitInfo(v);
    if(!w) return;
    out.push({ visitId: v.id, clinicId: onList.has(v.clinicId) ? v.clinicId : null, // its line opens the clinic only when it is on the list
      label: clinicLabel(v.clinicId, v), date: v.date, rep: v.rep || null, withRep: v.withRep || null,
      wait: w.wait, lost: w.lostTxt, mem: w.mem, here: w.here, own: w.own, old: w.old, othersAt: w.othersAt || [], lostAt: w.lostAt });
  });
  return out;
}
// The lists on the red bar at the bottom (v123): too large for the cloud, or refused (the rules / no access) — each
// key once, and whether this phone keeps its changes (queued) or they were not saved at all.
function alertsHeld(){
  const out = [], seen = new Set();
  Object.keys(_tooLarge).forEach(id => { const t = _tooLarge[id]; if(!t || !t.key || seen.has(t.key)) return; seen.add(t.key); out.push({ key: t.key, kept: !!t.kept }); });
  _saveBlocked.forEach(k => { if(!seen.has(k)){ seen.add(k); out.push({ key: k, kept: outboxHas(k) }); } });
  _saveParked.forEach((why, k) => { if(!seen.has(k)){ seen.add(k); out.push({ key: k, kept: true }); } });
  return out;
}
// What this phone knows — read from the device only, never from the cloud.
function alertsDevice(){
  let snapDay = null; try{ snapDay = localStorage.getItem(SNAP_DAY); }catch(e){}
  return {
    online: navigator.onLine !== false,
    // the queue as the pill counts it (memory included): a list too large for the cloud or refused is not uploading —
    // the red bar at the bottom says so (updateSyncBadge, v123)
    outbox: outboxWaiting().filter(x => !_saveBlocked.has(x.key) && !_saveParked.has(x.key)),
    memOnly: [..._memOnly],             // queued keys the phone could not keep
    memBar: memOnlyLines(),             // the red bar's lines, as it shows them
    held: alertsHeld(),                 // the red bar at the bottom (tooLargeLines): its lists …
    heldBar: tooLargeLines(),           // … its lines, as it shows them
    heldRetry: tooLargeRetry(),         // … and its "Try again"
    refused: [..._refused.entries()].map(([key, msg]) => ({ key, msg })),   // a whole document the cloud refused (#refusedPill)
    photos: alertsPhotoFacts(),
    erpDirty: !!_erpDirty,
    erpImport: lastErpImport(),
    snapDay,
    snapFail: snapFailInfo(),           // the daily backup's own record of its last failure (04, maybeSnapshot)
    snapHeld: snapshotBlockedWhy(),     // why this phone does not take it now ('copy' | 'queued' | null)
    basis: alertsBasis(),
  };
}
// The early open's window (v126 speed, part 3): the phone's copy drawn, the start's read from the cloud not ended.
function alertsWindow(){ return typeof _early !== 'undefined' && !!_early && _early.state === 'drawn' && !_cloudRead; }
// What the lists on screen are, for the cards that say what they are based on: while the early open's line is up (the
// window, or a start whose read failed) the phone's copy and its own time — copyTimeText, the line's words —; else the
// lists this refresh served from the phone's copy (a read that failed, an offline start; a list this phone holds
// changes of waits in the queue: its copy is the newest, not a stale one). Nothing here says "synced" or "up to date".
function alertsBasis(){
  const copy = typeof _copyLine !== 'undefined' && _copyLine && _early ? (_copyLine === 'failed' ? 'failed' : 'updating') : alertsWindow() ? 'updating' : null;
  return { copy, at: copy && _early && _early.at ? copyTimeText(_early.at) : null,
    phone: Object.keys(_mirrorUsed).filter(k => !outboxHas(k)).concat(Object.keys(_loadFailed)), unconfirmed: earlyUnconfirmed() };
}
function alertsInput(){
  const now = Date.now(), today = todayStr();
  return { today, now, user: { name: currentUser.name, role: currentUser.role }, reps: REPS.slice(),
    team: staff.map(s => s && s.name).filter(Boolean),
    // the sales lines through the pass the screens use, kept per data state (erpShareNow, 11-erp.js; v126 speed part 4)
    data: { clinics, visits, dayPlans, events, targets, erpSales, erpMap, erpShare: erpShareNow() },
    responseHours: typeof kpiSettings === 'function' ? kpiSettings().responseHours : undefined,   // the KPI scorecard's hours (16-kpi.js)
    settings: BENCHMARKS && BENCHMARKS.alerts, device: alertsDevice(), fmtDate, monthLabel, cache: _alertsCache, state: alertsState() };
}
function alertsCompute(){
  // an older cached core.js (a release race) has no rules: no bell rather than a broken screen
  if(!currentUser || typeof UMCore.alertsFor !== 'function') return { shown: [], hidden: [], nextAt: 0, devKey: null };
  const devKey = alertsDeviceKey(), inp = alertsInput(), list = UMCore.alertsFor(inp);
  const r = UMCore.alertsVisible(list, inp.state, inp.today, inp.now);
  r.nextAt = typeof UMCore.alertsNextAt === 'function' ? UMCore.alertsNextAt(inp) : 0;
  r.devKey = devKey;
  return r;
}
function alertsSheetOpen(){
  const back = document.getElementById('modalBack');
  return !!(back && back.classList.contains('show') && document.getElementById('alertsCenter'));
}
// Work the alerts out now: the bell, and the open sheet when what it lists changed (or when asked). Called when they
// are due (alertsSoon) and by the sheet's own taps.
function refreshAlerts(forceSheet){
  if(!currentUser || !document.getElementById('alertsBell')) return;
  let r;
  try{ r = alertsCompute(); }catch(e){ console.error('alerts center', e); return; }
  const sig = JSON.stringify([r.shown.map(a => [a.id, a.title, a.why, a.msg || '', (a.items || []).map(i => [i.text, i.note || ''])]), r.hidden.map(a => [a.id, a.hidden, a.until])]);
  const changed = sig !== _alertsSig;
  _alerts = r; _alertsSig = sig; _alertsDevKey = r.devKey; _alertsWho = currentUser.name + '|' + currentUser.role;
  alertsBellPaint(r.shown.length);
  alertsArm(r.nextAt);
  if((changed || forceSheet) && alertsSheetOpen()) renderAlertsSheet();
}
// The top bar's bell (v125): its number is the cards in the sheet. Written only where it changes — a 20-second round
// that brings nothing new changes nothing on the page (v126 speed, part 2).
function alertsBellPaint(n){
  const bell = document.getElementById('alertsBell'), badge = document.getElementById('alertsBellN');
  if(!bell || !badge) return;
  const txt = n > 99 ? '99+' : String(n), label = n ? `Alerts (${n})` : 'Alerts', aria = trOf(label) || label;
  if(badge.textContent !== txt) badge.textContent = txt;
  if(badge.hidden !== !(n > 0)) badge.hidden = !(n > 0);
  if(bell.classList.contains('has') !== n > 0) bell.classList.toggle('has', n > 0);
  if(bell.dataset.count !== String(n)) bell.dataset.count = String(n);
  if(bell.getAttribute('aria-label') !== aria) bell.setAttribute('aria-label', aria);
}
function renderAlertsBell(){ alertsAsk(); }

// ---- when the alerts are worked out (v126 speed) ----
// The drawings of 05 (msBell: the data on screen changed), the bars (04), the photo notes (12) and the clock only ASK.
// The alerts are worked out — never inside a drawing, never while a refresh is on its way (the start's read, a 20-second
// round: after it), never in the early open's window (the phone's copy drawn, the start's read not ended: after it — 15 s
// at most), and after the home's figures (msWhenReady), just after the next paint. The sheet works them out
// at once when it is opened, and after each of its own taps. A bar or a photo note asks only when what this phone knows
// changed (alertsDeviceKey): a round that brings nothing new calls the bars' functions but works no alert out and
// leaves the bell as it is (v126 speed, part 2).
let _alertsAsk = 0;   // when a compute was asked for and is not done yet (0: none)
let _alertsWaiters = [];
let _alertsDevKey = null;   // what this phone knew (alertsDeviceKey) when the alerts were last worked out
let _alertsWho = null;      // whose alerts the bell shows ('name|role')
function alertsAsk(){
  if(!currentUser) return;
  // another person on the phone: the bell never shows the previous person's alerts while this person's are worked out
  const who = currentUser.name + '|' + currentUser.role;
  if(_alertsWho !== who){ _alertsWho = who; _alerts = { shown: [], hidden: [] }; _alertsSig = ''; _alertsDevKey = null; _alertsShowHidden = false; alertsArm(0); alertsBellPaint(0); }
  if(_alertsAsk) return;
  _alertsAsk = Date.now();
  alertsWhenFree();
}
// A bar, a photo note, today's backup, the connection (04, 12): asks when what they say changed since the last compute.
function alertsSoon(){ if(currentUser && alertsDeviceKey() !== _alertsDevKey) alertsAsk(); }
// What this phone knows of itself, as one short text — the facts the sync, backup and basis cards read, without the
// visits (cheap): the queue, what is only in memory, the red bar at the bottom, a refused document, the sales retry
// bar, the connection, the early open's line and the lists from the phone's copy, today's backup, the photos this
// phone holds, saw land or found lost.
function alertsDeviceKey(){
  try{
    const kept = []; _photoKept.forEach((r, id) => kept.push(id + ':' + (r && r.on) + (r && r.up ? '+' : '')));
    let snapDay = null; try{ snapDay = localStorage.getItem(SNAP_DAY); }catch(e){}
    return JSON.stringify([outboxList(), [..._memOnly], memOnlyPhotos(), Object.keys(_tooLarge).map(k => k + ':' + (_tooLarge[k] && _tooLarge[k].kept ? 1 : 0)), [..._saveBlocked],
      [..._saveParked.entries()], [..._refused.entries()], !!_erpDirty, navigator.onLine !== false, earlyUnconfirmed(), _copyLine || null, alertsWindow(),
      Object.keys(_mirrorUsed).sort(), Object.keys(_loadFailed).sort(), snapDay, snapFailInfo(), kept.sort(), _photoLanded.size, _photoLost.size]);
  }catch(e){ return 'x' + Date.now(); }
}
// Settles once no compute is waiting (the harnesses wait on it, as on msWhenReady).
function alertsWhenReady(){ return _alertsAsk ? new Promise(res => _alertsWaiters.push(res)) : Promise.resolve(_alerts); }
function alertsSettle(){ const w = _alertsWaiters; _alertsWaiters = []; w.forEach(f => { try{ f(_alerts); }catch(e){} }); }
function alertsBusy(){
  return (typeof _loadAllRun !== 'undefined' && !!_loadAllRun) || (typeof _roundBusy !== 'undefined' && _roundBusy)
    || (alertsWindow() && Date.now() - _alertsAsk < 15000);
}
function alertsWhenFree(){
  if(!currentUser){ _alertsAsk = 0; alertsSettle(); return; }
  if(typeof _loadAllRun !== 'undefined' && _loadAllRun){ const p = _loadAllRun; p.then(alertsWhenFree, alertsWhenFree); return; }   // a refresh on its way: after it
  if(alertsBusy()){ setTimeout(alertsWhenFree, 300); return; }                                                                      // a round's upload, the early open's window
  const go = () => {
    if(!currentUser){ _alertsAsk = 0; alertsSettle(); return; }
    if(alertsBusy()){ alertsWhenFree(); return; }
    _alertsAsk = 0;
    try{ refreshAlerts(false); } finally { alertsSettle(); }
  };
  // just after the next paint (as the home's figures are: msSchedule), at once on a page that paints no frame (hidden)
  const idle = () => { if(document.visibilityState !== 'visible' || typeof requestAnimationFrame !== 'function') setTimeout(go, 0); else requestAnimationFrame(() => setTimeout(go, 0)); };
  if(typeof msWhenReady === 'function') Promise.resolve(msWhenReady()).then(idle, idle); else idle();
}
// ---- the clock: an alert that comes due with no data change (v126 speed: a round that brings nothing new draws nothing) ----
// Every compute knows the next moment one may come, go or change its words with the clock alone (UMCore.alertsNextAt:
// midnight, the hours set, a client request turning late, a change or a photo waiting longer than the minutes set …);
// the alerts are worked out again at that moment, and whenever a round that brought nothing new finds it passed
// (alertsClock, from msClock) or the page comes back on screen (a phone asleep holds its timers back).
let _alertsDue = 0, _alertsTimer = 0;
function alertsArm(next){
  clearTimeout(_alertsTimer); _alertsTimer = 0;
  _alertsDue = next > 0 ? next : 0;
  if(!_alertsDue) return;
  const ms = Math.max(250, Math.min(_alertsDue - Date.now() + 150, 6 * 3600000));
  _alertsTimer = setTimeout(() => { _alertsTimer = 0; alertsAsk(); }, ms);
}
function alertsClock(){ if(!currentUser) return; if(_alertsDue && Date.now() >= _alertsDue) alertsAsk(); else alertsSoon(); }
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') alertsClock(); });
window.addEventListener('online', () => alertsSoon());
window.addEventListener('offline', () => alertsSoon());

// ---- the sheet (v125's component layer: the sheet frame, cards, list rows, chips, the empty state) ----
// The sheet opens with its <h3> (the frame's header tile, data-ic) and ends with its buttons (the frame's foot); only
// #alertsCenter — the cards — and the line under the title are drawn again when what they say changes.
function openAlerts(){
  if(!currentUser) return;
  refreshAlerts(false);
  const sup = currentUser.role === 'supervisor';
  showModal(`<h3 data-ic="bell">Alerts</h3>
    <p class="al-sub" id="alertsSub">${alertsSubHTML()}</p>
    <div id="alertsCenter">${alertsSheetHTML()}</div>
    ${sup ? `<button class="btn secondary" id="alertsSettingsBtn" onclick="openAlertSettings()">${I('settings')} <span>Alert settings</span></button>` : ''}
    <button class="btn secondary" onclick="closeModal()">Close</button>`);
}
function renderAlertsSheet(){
  const box = document.getElementById('alertsCenter'), sub = document.getElementById('alertsSub');
  if(box) box.innerHTML = alertsSheetHTML();
  if(sub) sub.innerHTML = alertsSubHTML();
}
// The line under the title; while the early open's line is up, what the cards are worked out from — the line's own words
// and the copy's own time (the screen is this phone's copy, not the cloud's: nothing here may read as "up to date").
function alertsSubHTML(){
  const b = alertsBasis(), base = '<span>What needs attention now. Each card says why it shows.</span>';
  if(!b.copy) return base;
  return base + `<span class="al-basis"><span>This phone's copy, saved</span> <span data-notr dir="auto">${esc(b.at || '')}</span> <span>${b.copy === 'failed' ? '— could not update from the cloud; it is tried again' : '— updating from the cloud…'}</span></span>`;
}
function alertsSheetHTML(){
  const r = _alerts;
  const cards = r.shown.length ? `<div class="al-list">${r.shown.map(a => alertCardHTML(a, false)).join('')}</div>`
    : `<div class="empty al-empty"><div class="big">${alertsBasis().copy ? "Nothing needs attention in this phone's copy." : 'Nothing needs attention right now.'}</div></div>`;
  const hidden = r.hidden.length ? `<div class="al-hidden">
      <button class="chip small" id="alertsHiddenBtn" onclick="alertsToggleHidden()">${_alertsShowHidden ? 'Hide the dismissed and snoozed' : `Dismissed or snoozed (${r.hidden.length})`}</button>
      ${_alertsShowHidden ? `<div class="al-list">${r.hidden.map(a => alertCardHTML(a, true)).join('')}</div>` : ''}
    </div>` : '';
  return cards + hidden;
}
function alertCardHTML(a, hidden){
  const items = a.items || [], more = Math.max(0, items.length - ALERT_SHOW_MAX);
  // ids and names reach the handlers only through data-* attributes; a line that opens something is a list row (.lrow)
  const item = it => {
    const cid = it.clinicId != null ? String(it.clinicId) : '';
    const go = cid || (it.key && alertKeyOpener(it.key));
    // a visit's photo line: its note's own words under it, as under the visit's thumbnails
    const note = it.note ? `<span class="al-note">${esc(it.note)}</span>` : '';
    const attrs = `${cid ? ` data-clinic="${esc(cid)}"` : ''}${it.key ? ` data-key="${esc(it.key)}"` : ''}`;
    const body = `<span class="lr-t"><span class="al-it">${esc(it.text)}</span>${note}</span>`;
    return go ? `<button class="lrow al-item clickable"${attrs} onclick="alertsOpenItem(this)">${body}<svg class="svgi lr-go" aria-hidden="true"><use href="#i-chev"/></svg></button>`
      : `<div class="lrow al-item"${attrs}>${body}</div>`;
  };
  const acts = [];
  if(a.open && ALERT_OPEN[a.open.screen]) acts.push(`<button class="chip small on" data-act="open" onclick="alertsOpen(this)">Open</button>`);
  if(a.action === 'flush') acts.push(`<button class="chip small" data-act="flush" onclick="alertsUploadNow(this)">Upload now</button>`);
  if(a.action === 'retryErp') acts.push(`<button class="chip small" data-act="retryErp" onclick="alertsRetryErp(this)">Retry the save</button>`);
  if(a.action === 'retryHeld') acts.push(`<button class="chip small" data-act="retryHeld" onclick="alertsRetryHeld(this)">Try again</button>`);
  if(a.action === 'checkBackup') acts.push(`<button class="chip small" data-act="checkBackup" onclick="alertsCheckBackup(this)">Check now</button>`);
  if(hidden) acts.push(`<button class="chip small" data-act="restore" onclick="alertsSetState(this, 'restore')">Show again</button>`);
  else {
    acts.push(`<button class="chip small" data-act="dismiss" onclick="alertsSetState(this, 'dismiss')">Dismiss for today</button>`);
    acts.push(`<button class="chip small" data-act="snooze" onclick="alertsSetState(this, 'snooze')">Snooze 3 days</button>`);
  }
  const state = !hidden ? '' : a.hidden === 'dismissed' ? 'Dismissed for today' : `Snoozed until ${fmtDate(UMCore.localDateStr(new Date(a.until)))}`;
  return `<section class="card al-card al-${esc(a.sev)}${hidden ? ' al-off' : ''}" data-al-id="${esc(a.id)}" data-al-type="${esc(a.type)}">
    <div class="al-head"><span class="al-ic" aria-hidden="true">${I(ALERT_ICON[a.type] || 'alert')}</span><div class="al-ht"><div class="al-title">${esc(a.title)}</div>${state ? `<div class="al-state">${esc(state)}</div>` : ''}</div></div>
    <div class="al-why">${(a.why || []).map(w => `<div>${esc(w)}</div>`).join('')}</div>
    ${a.msg ? `<div class="al-msg">${esc(a.msg)}</div>` : ''}
    ${items.length ? `<div class="lrows al-items">${items.slice(0, ALERT_SHOW_MAX).map(item).join('')}</div>${more ? `<div class="al-more">+${more} more</div>` : ''}` : ''}
    <div class="al-acts">${acts.join('')}</div>
  </section>`;
}
function alertOf(el){
  const card = el && el.closest ? el.closest('[data-al-id]') : null, id = card ? card.dataset.alId : null;
  return id == null ? null : (_alerts.shown.concat(_alerts.hidden).find(a => a.id === id) || null);
}
function alertsToggleHidden(){ _alertsShowHidden = !_alertsShowHidden; renderAlertsSheet(); }
function alertsSetState(btn, op){
  const card = btn && btn.closest ? btn.closest('[data-al-id]') : null;
  if(!card || !currentUser) return;
  const st = UMCore.alertStateNext(alertsState(), op, card.dataset.alId, todayStr(), Date.now());
  if(!alertsStateSave(st)){ showToast('⚠️ This phone could not keep the choice — its storage is full'); return; }
  refreshAlerts(true);
}

// ---- where each alert leads ----
// The home screen's card that holds the list (v125: on a phone the card is folded — msGo opens it).
function alertsGoToday(cardId){
  closeModal();
  switchView('today');
  msGo(cardId);
}
const ALERT_OPEN = {
  followups: () => alertsGoToday('msDueCard'),
  missed: () => alertsGoToday('msPlanCard'),     // the missed plans are listed under today's plan
  targetCard: () => alertsGoToday('targetCard'),
  // the sales coach on Reports judges the pace by the same rule (UMCore.targetPace), for the same person
  coach: a => {
    closeModal(); switchView('reports');
    if(a.open && a.open.rep) setReportRepFilter(a.open.rep);
    const el = document.getElementById('coachCard');
    if(el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
  },
  gallery: () => { closeModal(); openPhotoGallery(); },
  requests: () => { closeModal(); openClientLog(); },   // where a request is marked answered (16-kpi.js)
  calendar: a => { closeModal(); const t = todayStr(); calAnchor = t; calSelected = t; calRepFilter = ownRepOnly((a.open && a.open.rep) || 'all'); switchView('calendar'); },
  clinics: () => { closeModal(); switchView('clinics'); setClinicMode('dash'); },
  erpImport: () => openErpImport(),
  backup: () => { openExport(); setTimeout(() => { const el = document.getElementById('backupList'); if(el && el.scrollIntoView) el.scrollIntoView({ block: 'center' }); }, 80); },
};
function alertsOpen(btn){
  const a = alertOf(btn), go = a && a.open ? ALERT_OPEN[a.open.screen] : null;
  if(go) go(a);
}
// The screen where a change that did not land is made again.
function alertKeyOpener(key){
  const sup = !!currentUser && currentUser.role === 'supervisor';
  const view = v => () => { closeModal(); switchView(v); };
  switch(key){
    case 'visits': return view('log');
    case 'tasks': case 'dayPlans': return view('today');
    case 'clinics': return view('clinics');
    case 'events': return view('calendar');
    case 'products': return view('products');
    case 'chat': case 'memories': return view('team');
    case 'categoryGuides': return typeof openCategoryGuides === 'function' ? () => openCategoryGuides() : null;
    case 'targets': case 'benchmarks': case 'staff': case 'recycleBin': return sup ? () => openAdminPanel() : null;
    case 'erpSales': case 'erpNotes': return sup ? () => openErpImport() : null;
    default: return null;
  }
}
function alertsOpenItem(el){
  const a = alertOf(el);
  if(!a || !el) return;
  const cid = el.dataset.clinic, key = el.dataset.key;
  if(a.type === 'request'){ closeModal(); openClientLog(); return; } // the request's own list: "✓ Answered" is there
  if(cid){
    const c = clinics.find(x => x && String(x.id) === cid), id = c ? c.id : cid;
    if(a.type === 'overdue' && c){ confirmFollowUp(id); return; } // log the visit, reschedule or clear: the follow-up's own sheet
    openClinicDetail(id);
    return;
  }
  const go = key ? alertKeyOpener(key) : null;
  if(go) go();
}

// ---- the cards' own actions ----
async function alertsUploadNow(btn){
  if(btn) btn.disabled = true;
  // the early open's window: nothing reaches the cloud before the sign-in is confirmed — never "the cloud did not answer"
  if(earlyUnconfirmed()){ showToast('⏳ Not sent yet: the sign-in is still being confirmed — the changes upload by themselves once it is', 6000); if(btn) btn.disabled = false; return; }
  if(navigator.onLine === false){ showToast('📴 This phone is offline — the changes upload when the connection is back'); if(btn) btn.disabled = false; return; }
  if(_flushing){ showToast('⏳ Uploading…'); if(btn) btn.disabled = false; return; }
  await flushOutbox(); // the queue, and the photos this phone keeps (retryPhotos, in the background)
  // what is left, in the words of the bars: a change only in the app's memory never "stays on this phone"
  if(outboxList().length) showToast(_memOnly.size ? "⚠️ Not uploaded yet — the cloud did not answer. They are only in the app's memory: keep the app open and connected until it says Saved"
    : '⚠️ Not uploaded yet — the cloud did not answer. The changes stay on this phone and upload by themselves.');
  else { const left = photosToUpload(false); if(left) showToast('⏳ ' + photosLeftText(left)); }
  refreshAlerts(true);
}
async function alertsRetryErp(btn){
  if(!requireAdmin()) return;
  if(btn) btn.disabled = true;
  const r = await persistTold('erpSales');
  saveToast(r, 'erpSales', '✅ Sales file changes saved'); // what the save did, never "saved" for one that did not land (v123)
  refreshAlerts(true);
}
// The red bar's "Try again" (retryBlockedSaves): each list on it is sent once more, and says what it did.
async function alertsRetryHeld(btn){
  if(btn) btn.disabled = true;
  await retryBlockedSaves();
  refreshAlerts(true);
}
// The same one check the app makes on the first save of the day (maybeSnapshot):
// one read of today's backup, written when it is missing — never from data that
// did not load from the cloud.
async function alertsCheckBackup(btn){
  if(!requireAdmin()) return;
  // the very rule maybeSnapshot keeps (snapshotBlockedWhy): only from a copy that is the cloud's, with nothing of this phone's waiting
  const held = snapshotBlockedWhy();
  if(held){
    showToast(held === 'queued' ? '⏳ This phone does not take today\'s backup now: changes on this phone are still waiting to upload'
      : '⚠️ This phone does not take today\'s backup now: not every list on it came from the cloud yet', 6000);
    refreshAlerts(true);
    return;
  }
  if(btn) btn.disabled = true;
  await maybeSnapshot();
  const t = todayStr(), F = snapFailInfo();
  let day = null; try{ day = localStorage.getItem(SNAP_DAY); }catch(e){}
  showToast(day === t ? '✅ Today\'s backup is in the cloud'
    : F && F.day === t && F.why === 'tooLarge' ? '❌ Today\'s backup is too large for the cloud — take a Full backup (Export & backups)'
    : F && F.day === t && F.why === 'refused' ? '🔒 Today\'s backup was not saved: not allowed (ask the supervisor)'
    : '❌ Today\'s backup could not be saved — try again later');
  refreshAlerts(true);
}

// ---- the supervisor's settings (BENCHMARKS.alerts, for the whole team) ----
function openAlertSettings(){
  if(!requireAdmin()) return;
  const S = UMCore.alertSettings(BENCHMARKS && BENCHMARKS.alerts), L = UMCore.ALERT_LIMITS;
  const row = t => `<label class="al-set"><input type="checkbox" id="alT_${t}" data-type="${t}"${S.types[t] ? ' checked' : ''}>
      <span class="al-set-t"><b>${ALERT_TYPE_INFO[t][0]}</b><span class="al-set-d">${ALERT_TYPE_INFO[t][1]}</span></span></label>`;
  const num = ([k, label, step]) => `<label class="al-num"><span>${label}</span><input type="number" inputmode="decimal" id="alS_${k}" value="${S[k]}" step="${step}" min="${L[k][0]}" max="${L[k][1]}"></label>`;
  showModal(`<h3 data-ic="settings">Alert settings</h3>
    <p class="al-sub">For the whole team: a type switched off shows to no one. Dismiss and snooze stay each person's own.</p>
    <div id="alertSettings">
      <div class="card al-set-card">${UMCore.ALERT_TYPES.map(row).join('')}</div>
      <div class="card al-set-card">${ALERT_NUMBERS.map(num).join('')}</div>
    </div>
    <button class="btn" id="alertSettingsSave" onclick="saveAlertSettings()">Save</button>
    <button class="btn secondary" onclick="openAlerts()">Back</button>`);
}
async function saveAlertSettings(){
  if(!requireAdmin()) return false;
  const cur = UMCore.alertSettings(BENCHMARKS && BENCHMARKS.alerts), raw = { types: {} };
  UMCore.ALERT_TYPES.forEach(t => { const el = document.getElementById('alT_' + t); raw.types[t] = el ? !!el.checked : cur.types[t]; });
  Object.keys(UMCore.ALERT_DEFAULTS).forEach(k => { const el = document.getElementById('alS_' + k); raw[k] = el ? el.value : cur[k]; });
  const next = UMCore.alertSettings(raw, cur);   // a number out of its limits keeps the one in force
  const was = BENCHMARKS && BENCHMARKS.alerts;
  BENCHMARKS = Object.assign({}, BENCHMARKS, { alerts: next }); // the KPI settings and the evaluation targets stay as they are
  // one compare-and-set of the whole document (v123): what this save did is said, never "saved" for one that did not
  // land — refused, changed on another device (its bar), no answer in time (it may land late) — as the KPI settings do
  const r = await persistTold('benchmarks');
  if(!r.ok){
    // not saved: this phone's alerts follow the settings in force again — unless the save may still land (no answer
    // in time: followed, and the next refresh brings whatever the cloud holds)
    if(!(r.outcome && r.outcome.timeout) && BENCHMARKS && BENCHMARKS.alerts === next) BENCHMARKS = Object.assign({}, BENCHMARKS, { alerts: was });
    saveToast(r, 'benchmarks', '');
    refreshAlerts(true);
    return false;
  }
  showToast('✅ Alert settings saved for the whole team');
  openAlerts();
  return true;
}
