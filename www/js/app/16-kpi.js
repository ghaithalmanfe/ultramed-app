// KPI scorecard (management's 10 measures), client requests / escalations / stands log, government flag
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)

// Requests, escalations and stands are kept in the merge-safe `events` list
// with a `kind` and an `at` time and NO `date`, so the calendar and the
// reports (which read events by date) never show them. Figures come from
// UMCore.kpiScorecard — this file only shows and records.
function kpiSettings(){ return Object.assign({}, UMCore.KPI_DEFAULTS, (BENCHMARKS && BENCHMARKS.kpi) || {}); }
function localStamp(){ const d = new Date(); return todayStr() + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); }
function kpiRange(p){
  const t = todayStr();
  if(p === 'week') return { from: UMCore.getWeekDates(t)[0], to: t, label: 'This week' };
  if(p === 'last'){ const d = new Date(t + 'T00:00:00'); d.setDate(0); const to = UMCore.localDateStr(d); return { from: to.slice(0, 7) + '-01', to, label: 'Last month' }; }
  return { from: t.slice(0, 7) + '-01', to: t, label: 'This month' };
}
function kpiCards(reps, period){
  const r = kpiRange(period), data = digestDataKept(), rows = UMCore.erpAttributedRows(data), S = kpiSettings(); // (the lines kept for the data state)
  return reps.map(rep => UMCore.kpiScorecard(Object.assign({}, data, { today: todayStr() }), { rep, from: r.from, to: r.to, settings: S, rows }));
}
let _kpiRep = null, _kpiPeriod = 'month';
// The score as the home screen's ring: the arc is the score out of 100 (no arc, "—", where nothing was measured).
function kpiRing(total, size){
  const R = 42, C = 2 * Math.PI * R, f = total == null ? 0 : Math.max(0, Math.min(1, total / 100));
  return `<span class="kpi-ring" style="width:${size}px; height:${size}px;"><svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle class="trk" cx="50" cy="50" r="${R}"/>${total == null ? '' : `<circle class="val" cx="50" cy="50" r="${R}" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>`}</svg></span>`;
}
function openKpiScorecard(){
  const sup = currentUser.role === 'supervisor';
  if(!_kpiRep || (!sup && _kpiRep !== currentUser.name)) _kpiRep = sup ? 'all' : currentUser.name;
  const reps = sup ? REPS.slice() : [currentUser.name];
  const r = kpiRange(_kpiPeriod);
  const cards = kpiCards(reps, _kpiPeriod);
  const pct = x => x == null ? '—' : Math.round(x * 100) + '%';
  const color = x => x == null ? 'var(--muted)' : x >= 0.85 ? 'var(--sage-ink)' : x >= 0.6 ? 'var(--amber-ink)' : 'var(--coral-ink)';
  const bar = x => `<div style="height:6px; border-radius:3px; background:var(--paper); overflow:hidden; margin-top:3px;"><div style="width:${x == null ? 0 : Math.round(Math.min(1, x) * 100)}%; height:100%; background:${x == null ? 'transparent' : x >= 0.85 ? 'var(--sage)' : x >= 0.6 ? 'var(--amber)' : 'var(--coral)'};"></div></div>`;
  const chips = (sup ? ['all', ...reps] : reps).map(x => `<div class="chip small ${_kpiRep === x ? 'on' : ''}" onclick="_kpiRep='${jsArg(x)}'; openKpiScorecard()">${x === 'all' ? 'Team' : esc(x)}</div>`).join('');
  const per = [['month', 'This month'], ['week', 'This week'], ['last', 'Last month']].map(([k, l]) => `<div class="chip small ${_kpiPeriod === k ? 'on' : ''}" onclick="_kpiPeriod='${jsArg(k)}'; openKpiScorecard()">${l}</div>`).join('');
  let body;
  if(_kpiRep === 'all'){
    body = `<div class="kpi-people">${cards.map(c => `<button class="kpi-pc" onclick="_kpiRep='${jsArg(c.rep)}'; openKpiScorecard()">${kpiRing(c.total, 64)}<span class="kpi-pt"><span class="kpi-pn">${esc(c.rep)}</span><span class="kpi-ps" style="color:${color(c.total == null ? null : c.total / 100)};">${c.total == null ? '—' : c.total + '/100'}</span></span><svg class="svgi lr-go" aria-hidden="true"><use href="#i-chev"/></svg></button>`).join('')}</div>
    <div class="card kpi-table" style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
      <tr><th style="text-align:start; padding:4px;">KPI</th><th style="padding:4px;">Weight</th>${cards.map(c => `<th style="padding:4px;">${esc(c.rep)}</th>`).join('')}</tr>
      <tr style="font-weight:800; font-size:14px;"><td style="padding:4px;">Total score</td><td></td>${cards.map(c => `<td style="text-align:center; padding:4px; color:${color(c.total == null ? null : c.total / 100)};">${c.total == null ? '—' : c.total + '/100'}</td>`).join('')}</tr>
      ${cards[0] ? cards[0].items.map((it, i) => `<tr style="border-top:1px solid var(--line, #eee);"><td style="padding:4px;">${esc(it.label)}</td><td style="text-align:center; color:var(--muted);">${it.weight}%</td>${cards.map(c => `<td style="text-align:center; padding:4px; font-weight:700; color:${color(c.items[i].score)};">${pct(c.items[i].score)}</td>`).join('')}</tr>`).join('') : ''}
      <tr style="border-top:1px solid var(--line, #eee);"><td style="padding:4px; color:var(--muted);">Stands active · checked</td><td></td>${cards.map(c => `<td style="text-align:center; color:var(--muted);">${c.stands.active} · ${c.stands.checked}</td>`).join('')}</tr>
    </table></div>
    <div style="color:var(--muted); font-size:11.5px; margin-top:6px;">Tap a name above for the detail behind every score.</div>`;
  } else {
    const c = cards.find(x => x.rep === _kpiRep) || cards[0];
    body = `<div class="kpi-hero">${kpiRing(c.total, 112)}<div class="kpi-hc"><div class="kpi-hs">${esc(c.rep)} · ${r.label} · ${c.workdays} working days</div>
      <div class="kpi-hn">${c.total == null ? '—' : c.total}<span>/100</span></div><div class="kpi-hl">Total score</div></div></div>
      <div class="card kpi-items">${c.items.map(it => `<div class="kpi-it">
        <div class="row-between"><b style="font-size:13px;">${esc(it.label)}</b><span style="font-weight:800; color:${color(it.score)};">${pct(it.score)} <span style="color:var(--muted); font-weight:400; font-size:11px;">× ${it.weight}%</span></span></div>
        ${bar(it.score)}
        <div style="font-size:12px; margin-top:4px;">${esc(it.value)}</div>
        <div style="font-size:11.5px; color:var(--muted);">Target: ${esc(it.target)}</div>
        ${it.detail ? `<div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${esc(it.detail)}</div>` : ''}
      </div>`).join('')}</div>
      <div class="card" style="margin-top:8px;"><b style="font-size:13px;">Stands</b> <span style="font-size:12px; color:var(--muted);">(tracked, no target)</span><div style="font-size:12px;">${c.stands.active} active · ${c.stands.checked} checked in the period</div></div>`;
  }
  showModal(`
    <h3 style="margin-top:0;">${I('target')} KPI scorecard</h3>
    <div class="chip-row" style="margin-bottom:6px;">${chips}</div>
    <div class="chip-row" style="margin-bottom:10px;">${per}</div>
    ${body}
    <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
      <button class="btn secondary" onclick="openClientLog()">${I('clipboard')} Requests, escalations & stands</button>
      ${sup ? `<button class="btn secondary" onclick="openKpiSettings()">${I('settings')} KPI settings</button>` : ''}
      <button class="btn secondary" onclick="closeModal()">Close</button>
    </div>`);
}
// The sheet's fields, in its order: [key, label, step] — a number out of UMCore.KPI_LIMITS is refused by name (v126)
const KPI_FIELDS = [['discountA', 'Max discount % – A clinics'], ['discountOther', 'Max discount % – other clinics'], ['discountOpenDay', 'Max discount % – open days'],
  ['openDays', 'Open days (dates, comma-separated, e.g. 2026-10-15, 2026-10-22)'],
  ['visitsPerDay', 'Field visits a day'], ['doctorsPerMonth', 'Different doctors met a month'], ['newProducts', 'New product placements a month'], ['newAccounts', 'New accounts a month'],
  ['responseHours', 'Answer a client request within (hours)'], ['returnsMax', 'Max returns (share of sales, e.g. 0.02 = 2%)', 0.005], ['rxGrowth', 'Prescription growth a month (e.g. 0.15 = 15%)', 0.01]];
function openKpiSettings(){
  if(!requireAdmin()) return;
  const S = kpiSettings(), L = UMCore.KPI_LIMITS || {};
  const f = ([k, label, step]) => k === 'openDays'
    ? `<label style="display:block; font-size:12.5px; margin-top:8px;">${label}<input type="text" id="kpi_openDays" value="${esc((S.openDays || []).join(', '))}" style="margin-top:3px;"></label>`
    : `<label style="display:block; font-size:12.5px; margin-top:8px;">${label}<input type="number" inputmode="decimal" step="${step || 1}"${L[k] ? ` min="${L[k][0]}" max="${L[k][1]}"` : ''} id="kpi_${k}" value="${S[k]}" style="margin-top:3px;"></label>`;
  showModal(`
    <h3 style="margin-top:0;">${I('settings')} KPI settings</h3>
    ${KPI_FIELDS.map(f).join('')}
    <div style="display:flex; gap:8px; margin-top:12px;"><button class="btn" onclick="saveKpiSettings()">Save</button><button class="btn secondary" onclick="openKpiScorecard()">Back</button></div>`);
}
async function saveKpiSettings(){
  if(!requireAdmin()) return false;
  if(typeof UMCore.kpiSettingsCheck !== 'function'){ showToast('⚠️ Not saved — reopen the app, then try again', 6000); return false; } // an older cached core.js (a release race)
  const raw = {};
  KPI_FIELDS.forEach(([k]) => { const el = document.getElementById('kpi_' + k); if(el) raw[k] = el.value; });
  // a number out of its limits (or not a number), or an open day that is not a date, is refused and its field named —
  // never the old value kept without a word under "saved" (as the alert settings, alerts review F12); nothing is saved,
  // the sheet stays with what was typed
  const chk = UMCore.kpiSettingsCheck(raw, kpiSettings());
  const badKeys = new Set(chk.bad.map(b => b.key).concat(chk.badDays.length ? ['openDays'] : []));
  KPI_FIELDS.forEach(([k]) => { const el = document.getElementById('kpi_' + k); if(el){ if(badKeys.has(k)) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); } });
  const first = KPI_FIELDS.find(([k]) => badKeys.has(k));
  if(first){
    if(first[0] === 'openDays'){ showToast(`⚠️ Not saved — Open days: write each date as 2026-10-15 (not a date: ${chk.badDays.join(', ')})`, 7000); return false; }
    const b = chk.bad.find(x => x.key === first[0]);
    showToast(`⚠️ Not saved — ${first[1]}: from ${b.min} to ${b.max}`, 7000);
    return false;
  }
  const r = await persistSettings({ kpi: chk.kpi }); // a save that did not land never takes effect, here or in this phone's copy (04-sync.js)
  if(r.ok){ showToast('✅ KPI settings saved'); openKpiScorecard(); return true; }
  saveToast(r, 'benchmarks', ''); // what happened instead — never silence
  return false;
}

// ---- client requests, escalations, stands ----
function clinicOptions(){ return clinics.filter(c => c.cls !== 'Closed').slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${esc(c.name)}"></option>`).join(''); }
function clinicByName(n){ const k = String(n || '').trim().toLowerCase(); return clinics.find(c => c.name.toLowerCase() === k) || null; }
function openClientLog(){
  const sup = currentUser.role === 'supervisor', me = currentUser.name;
  const mineOrAll = e => sup || e.rep === me || e.createdBy === me;
  const cl = id => (clinics.find(c => c.id === id) || {}).name || '—';
  const items = events.filter(e => e && (e.kind === 'issue' || e.kind === 'stand') && mineOrAll(e));
  const open = items.filter(e => e.kind === 'issue' && e.type === 'request' && !e.resolvedAt).sort((a, b) => a.at < b.at ? -1 : 1);
  const mStart = todayStr().slice(0, 7) + '-01';
  const recent = items.filter(e => e.kind === 'issue' && (e.type === 'escalation' || e.resolvedAt) && String(e.at).slice(0, 10) >= mStart).sort((a, b) => a.at < b.at ? 1 : -1);
  const stands = items.filter(e => e.kind === 'stand' && !e.removed);
  const age = e => { const h = Math.round((Date.now() - Date.parse(e.at)) / 3600000); return h < 24 ? h + 'h' : Math.round(h / 24) + 'd'; };
  const lim = kpiSettings().responseHours;
  showModal(`
    <h3 style="margin-top:0;">${I('clipboard')} Requests, escalations & stands</h3>
    <div style="color:var(--muted); font-size:12px; margin:-4px 0 10px;">A <b>request</b>: a clinic asked for something — close it when answered (target: within ${lim}h). An <b>escalation</b>: a clinic went to someone else in the company instead of its rep. A <b>stand</b>: a display placed in a clinic — tap "Checked" at each visit.</div>
    <div class="chip-row" style="margin-bottom:10px;">
      <div class="chip small" onclick="openClientLogForm('request')">+ Request</div>
      <div class="chip small" onclick="openClientLogForm('escalation')">+ Escalation</div>
      <div class="chip small" onclick="openClientLogForm('stand')">+ Stand</div>
    </div>
    <div class="section-title">Open requests (${open.length})</div>
    ${open.length ? open.map(e => `<div class="card req-row" style="margin-bottom:6px;"><div class="row-between"><b>${esc(cl(e.clinicId))}</b><span style="font-size:11.5px; color:${Date.now() - Date.parse(e.at) > lim * 3600000 ? 'var(--coral-ink)' : 'var(--muted)'};">${age(e)} · ${esc(e.rep || '')}</span></div><div style="font-size:12.5px;">${esc(e.text || '')}</div><button class="chip small" style="margin-top:6px;" onclick="resolveClientLog('${jsArg(e.id)}')">✓ Answered</button></div>`).join('') : '<div style="color:var(--muted); font-size:12.5px;">None open.</div>'}
    <div class="section-title">This month</div>
    ${recent.length ? recent.map(e => `<div class="req-line" style="font-size:12.5px; padding:4px 0; border-bottom:1px solid var(--line, #eee);"><span class="badge ${e.type === 'escalation' ? 'overdue' : 'done'}">${e.type === 'escalation' ? '⚠️ Escalation' : '✓ Request'}</span> · <b>${esc(cl(e.clinicId))}</b> · ${esc(e.rep || '')} · ${fmtDate(String(e.at).slice(0, 10))}${e.via ? ' · went to ' + esc(e.via) : ''}${e.text ? ' — ' + esc(e.text) : ''}${e.resolvedAt ? ' <span style="color:var(--muted);">(answered in ' + Math.max(0, Math.round((Date.parse(e.resolvedAt) - Date.parse(e.at)) / 3600000)) + 'h)</span>' : ''}</div>`).join('') : '<div style="color:var(--muted); font-size:12.5px;">Nothing logged this month.</div>'}
    <div class="section-title">Stands (${stands.length})</div>
    ${stands.length ? stands.map(e => `<div class="card req-row" style="margin-bottom:6px;"><div class="row-between"><b>${esc(cl(e.clinicId))}</b><span style="font-size:11.5px; color:var(--muted);">${esc(e.rep || '')}</span></div><div style="font-size:12.5px;">${esc(e.brand || '')}${e.text ? ' — ' + esc(e.text) : ''}</div><div style="font-size:11.5px; color:var(--muted);">Placed ${fmtDate(String(e.at).slice(0, 10))} · last checked ${(e.checks || []).length ? fmtDate(e.checks[e.checks.length - 1]) : 'never'}</div>
      <div style="display:flex; gap:6px; margin-top:6px;"><button class="chip small" onclick="checkStand('${jsArg(e.id)}')">✓ Checked today</button><button class="chip small" onclick="removeStand('${jsArg(e.id)}')">Removed</button></div></div>`).join('') : '<div style="color:var(--muted); font-size:12.5px;">No stands recorded.</div>'}
    <div style="display:flex; gap:8px; margin-top:12px;"><button class="btn secondary" onclick="openKpiScorecard()">KPI scorecard</button><button class="btn secondary" onclick="closeModal()">Close</button></div>`);
}
function openClientLogForm(kind){
  const t = { request: 'New client request', escalation: 'New escalation', stand: 'New stand' }[kind];
  showModal(`
    <h3 style="margin-top:0;">${t}</h3>
    <label style="font-size:12.5px;">Clinic<input type="text" id="clForm_clinic" list="clForm_list" placeholder="Start typing the clinic name" style="margin-top:3px;"></label>
    <datalist id="clForm_list">${clinicOptions()}</datalist>
    ${kind === 'escalation' ? `<label style="display:block; font-size:12.5px; margin-top:8px;">Who did the clinic contact instead?<input type="text" id="clForm_via" placeholder="e.g. the manager, accounts, warehouse" style="margin-top:3px;"></label>` : ''}
    ${kind === 'stand' ? `<label style="display:block; font-size:12.5px; margin-top:8px;">Brand / stand<input type="text" id="clForm_brand" placeholder="e.g. Philips Sonicare counter stand" style="margin-top:3px;"></label>` : ''}
    <label style="display:block; font-size:12.5px; margin-top:8px;">${kind === 'request' ? 'What did they ask for?' : kind === 'escalation' ? 'What was it about?' : 'Note'}<textarea id="clForm_text" rows="3" style="margin-top:3px;"></textarea></label>
    <div style="display:flex; gap:8px; margin-top:12px;"><button class="btn" onclick="saveClientLog('${jsArg(kind)}')">Save</button><button class="btn secondary" onclick="openClientLog()">Back</button></div>`);
}
async function saveClientLog(kind){
  const c = clinicByName((document.getElementById('clForm_clinic') || {}).value);
  if(!c){ showToast('Pick a clinic from the list'); return; }
  const v = id => ((document.getElementById(id) || {}).value || '').trim();
  const e = { id: uid(), kind: kind === 'stand' ? 'stand' : 'issue', clinicId: c.id, rep: c.rep || currentUser.name, createdBy: currentUser.name, at: localStamp(), text: v('clForm_text') };
  if(kind !== 'stand') e.type = kind;
  if(kind === 'escalation') e.via = v('clForm_via');
  if(kind === 'stand'){ e.brand = v('clForm_brand'); e.checks = [todayStr()]; }
  events.push(e);
  if(!await persist('events')){ events = events.filter(x => x.id !== e.id); showToast('❌ Not saved — check the connection and try again'); return; }
  showToast('✅ Saved');
  openClientLog();
}
async function resolveClientLog(id){
  const e = events.find(x => x.id === id); if(!e) return;
  e.resolvedAt = localStamp(); e.resolvedBy = currentUser.name;
  if(!await persist('events')){ e.resolvedAt = null; showToast('❌ Not saved — try again'); return; }
  openClientLog();
}
async function checkStand(id){
  const e = events.find(x => x.id === id); if(!e) return;
  e.checks = (e.checks || []).filter(d => d !== todayStr()).concat([todayStr()]);
  const r = await persistTold('events');
  saveToast(r, 'events', '✅ Stand checked'); openClientLog();
}
async function removeStand(id){
  const e = events.find(x => x.id === id); if(!e) return;
  if(!confirm('Mark this stand as removed from the clinic?')) return;
  e.removed = todayStr();
  await persist('events'); openClientLog();
}
// Government flag (Admin → Territory): named MOH / ministry / KU / KOC are on by default.
async function toggleGovClinic(clinicId){
  if(!requireAdmin()) return;
  const c = clinics.find(x => x.id === clinicId); if(!c) return;
  c.gov = !UMCore.isGovClinic(c);
  const r = await persistTold('clinics');
  saveToast(r, 'clinics', `${c.name}: ${c.gov ? 'government account – visited every week' : 'not a government account'}`);
  renderAdminTerritory();
}

// Month by month: the same month figures as the rest of the app, side by side
// for the last months (UMCore.monthlyTrend), so progress is visible at a glance.
let _mbmRep = null, _mbmN = 6;
function openMonthByMonth(){
  const sup = currentUser.role === 'supervisor';
  if(!_mbmRep || (!sup && _mbmRep !== currentUser.name)) _mbmRep = sup ? 'all' : currentUser.name;
  const reps = sup ? REPS.slice() : [currentUser.name];
  const T = UMCore.monthlyTrend(Object.assign(digestDataKept(), { today: todayStr() }), { reps, months: _mbmN, settings: kpiSettings() }); // (the pass kept for the data state)
  const M = T.months, team = _mbmRep === 'all';
  const of = m => team ? m.team : m.byRep[_mbmRep];
  const name = m => { const n = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m.month.slice(5, 7), 10) - 1] + ' ' + m.month.slice(2, 4); return m.partial ? n + ' (to ' + parseInt(m.to.slice(8, 10), 10) + ')' : n; };
  const kd = n => moneyWhole(n);   // grouped, the currency after the figure (د.ك in Arabic)
  const arrow = (a, b) => a == null || b == null || !(b > 0) || a === b ? '' : a >= b ? `<span style="color:var(--sage-ink); font-weight:700;">▲ ${Math.round((a - b) / b * 100)}%</span>` : `<span style="color:var(--coral-ink); font-weight:700;">▼ ${Math.round((b - a) / b * 100)}%</span>`;
  const bar = (x, max, color) => `<div style="height:8px; border-radius:4px; background:var(--paper); overflow:hidden; margin-top:3px;"><div style="width:${max > 0 && x ? Math.round(Math.min(1, x / max) * 100) : 0}%; height:100%; background:${color};"></div></div>`;
  const chips = (sup ? ['all', ...reps] : reps).map(x => `<div class="chip small ${_mbmRep === x ? 'on' : ''}" onclick="_mbmRep='${jsArg(x)}'; openMonthByMonth()">${x === 'all' ? 'Team' : esc(x)}</div>`).join('');
  const per = [[6, '6 months'], [12, '12 months']].map(([k, l]) => `<div class="chip small ${_mbmN === k ? 'on' : ''}" onclick="_mbmN=${k}; openMonthByMonth()">${l}</div>`).join('');
  const dayN = parseInt(T.end.slice(8, 10), 10);
  const maxS = Math.max(0, ...M.map(m => Math.max(of(m).sales || 0, of(m).target || 0)));
  const maxSame = Math.max(0, ...M.map(m => of(m).sameDays || 0));
  const sales = M.map((m, i) => { const x = of(m), p = i ? of(M[i - 1]) : null;
    return `<div style="margin-top:9px;"><div class="row-between" style="font-size:12.5px;"><b>${name(m)}</b><span>${x.sales == null ? '<span style="color:var(--muted);">no sales file</span>' : kd(x.sales) + (x.target ? ' of ' + kd(x.target) + ' · <b>' + Math.round(x.pct * 100) + '%</b>' : '')}</span></div>
      ${bar(x.sales, maxS, 'var(--sage)')}${x.target ? bar(x.target, maxS, 'var(--line, #d9e2dc)') : ''}</div>`; }).join('');
  const same = M.map((m, i) => { const x = of(m), p = i ? of(M[i - 1]) : null;
    return `<div style="margin-top:8px;"><div class="row-between" style="font-size:12.5px;"><b>${name(m).replace(/ \(to \d+\)$/, '')}</b><span>${x.sameDays == null ? '<span style="color:var(--muted);">no sales file</span>' : kd(x.sameDays) + ' ' + arrow(x.sameDays, p && p.sameDays)}</span></div>${bar(x.sameDays, maxSame, 'var(--amber)')}</div>`; }).join('');
  const nR = team ? reps.length : 1;
  const kpiOf = m => { if(!team) return of(m).kpi; const v = reps.map(r => m.byRep[r].kpi).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const perDay = m => m.workdays ? Math.round((of(m).fieldVisits || 0) / m.workdays / nR * 10) / 10 : 0;
  const td = 'style="text-align:center; padding:5px 3px;"';
  const rows = M.map((m, i) => `<tr style="border-top:1px solid var(--line, #eee);"><td style="padding:5px 3px; font-weight:700; white-space:nowrap;">${name(m)}</td>
    <td ${td}>${perDay(m)} ${i ? arrow(perDay(m), perDay(M[i - 1])) : ''}</td><td ${td}>${of(m).doctorsMet || 0}</td>
    <td ${td}>${of(m).newAccounts == null ? '—' : of(m).newAccounts}</td><td ${td}>${of(m).placements == null ? '—' : of(m).placements}</td>
    <td ${td}><b>${kpiOf(m) == null ? '—' : kpiOf(m)}</b>${i && kpiOf(m) != null && kpiOf(M[i - 1]) != null ? ' ' + arrow(kpiOf(m), kpiOf(M[i - 1])) : ''}</td></tr>`).join('');
  const mcards = M.map((m, i) => `<div class="mbm-card"><div class="mbm-m">${name(m)}</div><div class="mbm-g">
      <span><span>Visits a day${team ? ' (each)' : ''}</span><b>${perDay(m)} ${i ? arrow(perDay(m), perDay(M[i - 1])) : ''}</b></span>
      <span><span>Doctors met</span><b>${of(m).doctorsMet || 0}</b></span>
      <span><span>New accounts</span><b>${of(m).newAccounts == null ? '—' : of(m).newAccounts}</b></span>
      <span><span>New products</span><b>${of(m).placements == null ? '—' : of(m).placements}</b></span>
      <span><span>KPI${team ? ' (avg)' : ''}</span><b>${kpiOf(m) == null ? '—' : kpiOf(m)}${i && kpiOf(m) != null && kpiOf(M[i - 1]) != null ? ' ' + arrow(kpiOf(m), kpiOf(M[i - 1])) : ''}</b></span></div></div>`).join('');
  showModal(`
    <h3 style="margin-top:0;">${I('chart')} Month by month</h3>
    <div class="chip-row" style="margin-bottom:6px;">${chips}</div>
    <div class="chip-row" style="margin-bottom:10px;">${per}</div>
    ${M.length < 2 ? '<div class="nudge">Only one month of data in the app so far — earlier months appear here once their sales files and visits are in.</div>' : ''}
    <div class="card"><b style="font-size:13.5px;">Sales against target</b><div style="font-size:11.5px; color:var(--muted);">ERP invoices of each month; grey bar = that month's own DSR target</div>${sales}</div>
    <div class="card" style="margin-top:8px;"><b style="font-size:13.5px;">Same days of each month: day 1–${dayN}</b><div style="font-size:11.5px; color:var(--muted);">A fair comparison while this month is still running</div>${same}</div>
    <div class="card" style="margin-top:8px; overflow-x:auto;"><b style="font-size:13.5px;">Field work and KPI</b>
      <div class="mbm-cards">${mcards}</div>
      <table class="mbm-table" style="width:100%; border-collapse:collapse; font-size:12px; margin-top:6px;"><tr style="color:var(--muted); font-size:11px;"><th style="text-align:start; padding:3px;">Month</th><th>Visits a day${team ? ' (each)' : ''}</th><th>Doctors met</th><th>New accounts</th><th>New products</th><th>KPI${team ? ' (avg)' : ''}</th></tr>${rows}</table>
      <div style="font-size:11px; color:var(--muted); margin-top:6px;">"—" = not measurable: new accounts need an earlier month in the sales files; no KPI for a month with no visit logged. The running month counts to today.</div></div>
    <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
      <button class="btn secondary" onclick="openKpiScorecard()">${I('target')} KPI scorecard</button>
      <button class="btn secondary" onclick="closeModal()">Close</button>
    </div>`);
}
