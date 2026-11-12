// in-app alerts center: the header bell, the alerts sheet, dismiss / snooze, the supervisor's alert settings
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)

// The rules are UMCore.alertsFor (pure, unit-tested in tests/core.test.js).
// This file gathers what only this phone knows — the outbox (outboxWaiting),
// saves that did not land (saveFailures), sales changes behind the red retry
// bar (_erpDirty), the last sales import (lastErpImport, 11-erp.js), today's
// backup check (um_snapDay / um_snapLast, maybeSnapshot) — keeps each
// person's dismiss / snooze on this device, and draws the bell and the sheet.
// The supervisor's on/off per type and the hours / limits live in
// BENCHMARKS.alerts, saved through persist('benchmarks') like the KPI
// settings; a rep can neither open nor save them. Nothing here reads the
// cloud: the bell costs no download.
const ALERT_STATE = 'um_alerts:';   // + the person's name → { dismissed: {id: day}, snoozed: {id: ms} }
const ALERT_SHOW_MAX = 8;           // list lines shown per card; "+N more" after them
const ALERT_ICON = { overdue: 'calendar', missed: 'clipboard', noActivity: 'users', target: 'target', drop: 'chart', sync: 'refresh', erpImport: 'download', backup: 'shield' };
const ALERT_TYPE_INFO = {
  overdue: ['Overdue follow-ups', 'Clinics whose follow-up date has passed: each person her own, the supervisor everyone\'s.'],
  missed: ['Missed planned visits', 'Planned in the last 14 days, not visited on the day nor since.'],
  noActivity: ['No field visit by a set hour', 'Supervisor only: a person with no field visit logged today by the hour below, on working days.'],
  target: ['Month target at risk', 'The month figure (ERP files) below the pace set below, counted in working days to the ERP cut-off.'],
  drop: ['Customers buying less than last month', 'Invoiced sales in the ERP files from day 1 to the cut-off, against the same days of last month.'],
  sync: ['Sync problems', 'Changes waiting on the phone for long, and saves that did not reach the cloud.'],
  erpImport: ['Failed sales file import', 'Supervisor only: the last import on this phone failed.'],
  backup: ['Daily backup', 'Supervisor only: today\'s backup could not be saved, or is not confirmed after the hour below.'],
};
const ALERT_NUMBERS = [
  ['noActivityHour', 'No field visit by (hour, 0–23)', 1],
  ['targetPacePct', 'Target at risk below (% of an even pace)', 1],
  ['targetMinDays', 'Judge the target pace from working day', 1],
  ['dropPct', 'Customer down by at least (%)', 1],
  ['dropMinKD', 'Customer bought at least (KD, same days last month)', 0.01],
  ['outboxMinutes', 'Changes waiting longer than (minutes)', 1],
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
// What this phone knows — read from the device only, never from the cloud.
function alertsDevice(){
  let snapDay = null; try{ snapDay = localStorage.getItem(SNAP_DAY); }catch(e){}
  return {
    online: navigator.onLine !== false,
    outbox: outboxWaiting(),
    failed: currentUser ? saveFailures(currentUser.name) : [],
    erpDirty: !!_erpDirty,
    erpImport: lastErpImport(),
    snapDay,
    snapLast: alertsJSON(SNAP_LAST),
  };
}
function alertsCompute(){
  // an older cached core.js (a release race) has no rules: no bell rather than a broken screen
  if(!currentUser || typeof UMCore.alertsFor !== 'function') return { shown: [], hidden: [] };
  const now = Date.now(), today = todayStr();
  const list = UMCore.alertsFor({ today, now, user: { name: currentUser.name, role: currentUser.role }, reps: REPS.slice(),
    team: staff.map(s => s && s.name).filter(Boolean), data: { clinics, visits, dayPlans, events, targets, erpSales, erpMap },
    settings: BENCHMARKS && BENCHMARKS.alerts, device: alertsDevice(), fmtDate, cache: _alertsCache });
  return UMCore.alertsVisible(list, alertsState(), today, now);
}
function alertsSheetOpen(){
  const back = document.getElementById('modalBack');
  return !!(back && back.classList.contains('show') && document.getElementById('alertsCenter'));
}
// Recompute; the bell always, the open sheet when what it lists changed (or when asked).
function refreshAlerts(forceSheet){
  const bell = document.getElementById('alertsBell'), badge = document.getElementById('alertsBellN');
  if(!bell || !badge || !currentUser) return;
  let r;
  try{ r = alertsCompute(); }catch(e){ console.error('alerts center', e); return; }
  const sig = JSON.stringify([r.shown.map(a => [a.id, a.title, a.why, a.msg || '', (a.items || []).map(i => i.text)]), r.hidden.map(a => [a.id, a.hidden, a.until])]);
  const changed = sig !== _alertsSig;
  _alerts = r; _alertsSig = sig;
  const n = r.shown.length;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.classList.toggle('show', n > 0);
  bell.classList.toggle('has', n > 0);
  bell.dataset.count = String(n);
  const label = n ? `Alerts (${n})` : 'Alerts';
  bell.setAttribute('aria-label', trOf(label) || label);
  if((changed || forceSheet) && alertsSheetOpen()) renderAlertsSheet();
}
function renderAlertsBell(){ refreshAlerts(false); }

// ---- the sheet ----
function openAlerts(){
  if(!currentUser) return;
  refreshAlerts(false);
  showModal(`<div id="alertsCenter">${alertsSheetHTML()}</div>`);
}
function renderAlertsSheet(){
  const box = document.getElementById('alertsCenter');
  if(box) box.innerHTML = alertsSheetHTML();
}
function alertsSheetHTML(){
  const sup = currentUser.role === 'supervisor', r = _alerts;
  const cards = r.shown.length ? r.shown.map(a => alertCardHTML(a, false)).join('')
    : `<div class="card al-empty">${I('check')} <span>Nothing needs attention right now.</span></div>`;
  const hidden = r.hidden.length ? `<div class="al-hidden">
      <button class="chip small" id="alertsHiddenBtn" onclick="alertsToggleHidden()">${_alertsShowHidden ? 'Hide the dismissed and snoozed' : `Dismissed or snoozed (${r.hidden.length})`}</button>
      ${_alertsShowHidden ? r.hidden.map(a => alertCardHTML(a, true)).join('') : ''}
    </div>` : '';
  return `<h3 style="margin-top:0;">${I('bell')} <span>Alerts</span></h3>
    <p class="al-sub">What needs attention now. Each card says why it shows.</p>
    ${cards}${hidden}
    <div class="al-foot">
      ${sup ? `<button class="btn secondary" id="alertsSettingsBtn" onclick="openAlertSettings()">${I('settings')} <span>Alert settings</span></button>` : ''}
      <button class="btn secondary" onclick="closeModal()">Close</button>
    </div>`;
}
function alertCardHTML(a, hidden){
  const items = a.items || [], more = Math.max(0, items.length - ALERT_SHOW_MAX);
  // ids and names reach the handlers only through data-* attributes
  const item = it => {
    const cid = it.clinicId != null ? String(it.clinicId) : '';
    const go = cid || (it.key && alertKeyOpener(it.key));
    return `<div class="al-item${go ? ' clickable' : ''}"${cid ? ` data-clinic="${esc(cid)}"` : ''}${it.key ? ` data-key="${esc(it.key)}"` : ''}${go ? ' onclick="alertsOpenItem(this)"' : ''}>${esc(it.text)}</div>`;
  };
  const acts = [];
  if(a.open && ALERT_OPEN[a.open.screen]) acts.push(`<button class="chip small on" data-act="open" onclick="alertsOpen(this)">Open</button>`);
  if(a.action === 'flush') acts.push(`<button class="chip small" data-act="flush" onclick="alertsUploadNow(this)">Upload now</button>`);
  if(a.action === 'retryErp') acts.push(`<button class="chip small" data-act="retryErp" onclick="alertsRetryErp(this)">Retry the save</button>`);
  if(a.action === 'checkBackup') acts.push(`<button class="chip small" data-act="checkBackup" onclick="alertsCheckBackup(this)">Check now</button>`);
  if(hidden) acts.push(`<button class="chip small" data-act="restore" onclick="alertsSetState(this, 'restore')">Show again</button>`);
  else {
    acts.push(`<button class="chip small" data-act="dismiss" onclick="alertsSetState(this, 'dismiss')">Dismiss for today</button>`);
    acts.push(`<button class="chip small" data-act="snooze" onclick="alertsSetState(this, 'snooze')">Snooze 3 days</button>`);
  }
  const state = !hidden ? '' : a.hidden === 'dismissed' ? 'Dismissed for today' : `Snoozed until ${fmtDate(UMCore.localDateStr(new Date(a.until)))}`;
  return `<div class="card al-card al-${esc(a.sev)}${hidden ? ' al-off' : ''}" data-al-id="${esc(a.id)}" data-al-type="${esc(a.type)}">
    <div class="al-head"><span class="al-ic">${I(ALERT_ICON[a.type] || 'alert')}</span><div class="al-title">${esc(a.title)}</div></div>
    ${state ? `<div class="al-state">${esc(state)}</div>` : ''}
    <div class="al-why">${(a.why || []).map(w => `<div>${esc(w)}</div>`).join('')}</div>
    ${a.msg ? `<div class="al-msg">${esc(a.msg)}</div>` : ''}
    ${items.length ? `<div class="al-items">${items.slice(0, ALERT_SHOW_MAX).map(item).join('')}${more ? `<div class="al-more">+${more} more</div>` : ''}</div>` : ''}
    <div class="al-acts">${acts.join('')}</div>
  </div>`;
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
function alertsGoToday(anchorId){
  closeModal();
  switchView('today');
  const el = document.getElementById(anchorId);
  if(el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
}
const ALERT_OPEN = {
  followups: () => alertsGoToday('dueList'),
  missed: () => alertsGoToday('missedTitle'),
  target: () => alertsGoToday('targetCard'),
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
  if(navigator.onLine === false){ showToast('📴 This phone is offline — the changes upload when the connection is back'); if(btn) btn.disabled = false; return; }
  if(_flushing){ showToast('⏳ Uploading…'); if(btn) btn.disabled = false; return; }
  await flushOutbox();
  if(outboxList().length) showToast('⚠️ Not uploaded yet — the cloud did not answer. The changes stay on this phone and upload by themselves.');
  refreshAlerts(true);
}
async function alertsRetryErp(btn){
  if(!requireAdmin()) return;
  if(btn) btn.disabled = true;
  const ok = await persist('erpSales');
  showToast(ok ? '✅ Sales file changes saved' : '❌ Not saved — check the connection and try again');
  refreshAlerts(true);
}
// The same one check the app makes on the first save of the day (maybeSnapshot):
// one read of today's backup, written when it is missing — never from data that
// did not load from the cloud.
async function alertsCheckBackup(btn){
  if(!requireAdmin()) return;
  if(Object.keys(_mirrorUsed).length || Object.keys(_loadFailed).length || _bootCrashed || _seedClinics){
    showToast('⚠️ This phone\'s data did not fully load from the cloud — reopen the app on a good connection, then check again');
    return;
  }
  if(btn) btn.disabled = true;
  await maybeSnapshot();
  const t = todayStr(), L = alertsJSON(SNAP_LAST);
  let day = null; try{ day = localStorage.getItem(SNAP_DAY); }catch(e){}
  showToast(day === t ? (L && L.day === t && L.result === 'written' ? '✅ Today\'s backup was missing — it is saved now' : '✅ Today\'s backup is in the cloud')
    : '❌ Today\'s backup could not be saved — try again later');
  refreshAlerts(true);
}

// ---- the supervisor's settings (BENCHMARKS.alerts, for the whole team) ----
function openAlertSettings(){
  if(!requireAdmin()) return;
  const S = UMCore.alertSettings(BENCHMARKS && BENCHMARKS.alerts), L = UMCore.ALERT_LIMITS;
  const row = t => `<label class="al-set"><input type="checkbox" id="alT_${t}" data-type="${t}"${S.types[t] ? ' checked' : ''}>
      <span><b>${ALERT_TYPE_INFO[t][0]}</b><span class="al-set-d">${ALERT_TYPE_INFO[t][1]}</span></span></label>`;
  const num = ([k, label, step]) => `<label class="al-num"><span>${label}</span><input type="number" inputmode="decimal" id="alS_${k}" value="${S[k]}" step="${step}" min="${L[k][0]}" max="${L[k][1]}"></label>`;
  showModal(`<div id="alertSettings">
    <h3 style="margin-top:0;">${I('settings')} <span>Alert settings</span></h3>
    <p class="al-sub">For the whole team: a type switched off shows to no one. Dismiss and snooze stay each person's own.</p>
    <div class="card">${UMCore.ALERT_TYPES.map(row).join('')}</div>
    <div class="card">${ALERT_NUMBERS.map(num).join('')}</div>
    <div class="al-foot">
      <button class="btn" id="alertSettingsSave" onclick="saveAlertSettings()">Save</button>
      <button class="btn secondary" onclick="openAlerts()">Back</button>
    </div>
  </div>`);
}
async function saveAlertSettings(){
  if(!requireAdmin()) return false;
  const cur = UMCore.alertSettings(BENCHMARKS && BENCHMARKS.alerts), raw = { types: {} };
  UMCore.ALERT_TYPES.forEach(t => { const el = document.getElementById('alT_' + t); raw.types[t] = el ? !!el.checked : cur.types[t]; });
  Object.keys(UMCore.ALERT_DEFAULTS).forEach(k => { const el = document.getElementById('alS_' + k); raw[k] = el ? el.value : cur[k]; });
  const next = UMCore.alertSettings(raw, cur);   // a number out of its limits keeps the one in force
  const before = BENCHMARKS;
  BENCHMARKS = Object.assign({}, BENCHMARKS, { alerts: next }); // the KPI settings and the evaluation targets stay as they are
  const ok = await persist('benchmarks');
  if(!ok){
    BENCHMARKS = before;
    showToast('❌ Alert settings not saved — check the connection and try again');
    refreshAlerts(true);
    return false;
  }
  showToast('✅ Alert settings saved for the whole team');
  openAlerts();
  return true;
}

// The time-based rules (the hour, how long a change has waited) move without
// any save: the bell is looked at again every minute, and when the connection
// comes or goes.
setInterval(() => { if(currentUser && document.visibilityState === 'visible') refreshAlerts(false); }, 60000);
window.addEventListener('online', () => refreshAlerts(false));
window.addEventListener('offline', () => refreshAlerts(false));
