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
  const r = kpiRange(period), data = digestData(), rows = UMCore.erpAttributedRows(data), S = kpiSettings();
  return reps.map(rep => UMCore.kpiScorecard(Object.assign({}, data, { today: todayStr() }), { rep, from: r.from, to: r.to, settings: S, rows }));
}
let _kpiRep = null, _kpiPeriod = 'month';
function openKpiScorecard(){
  const sup = currentUser.role === 'supervisor';
  if(!_kpiRep || (!sup && _kpiRep !== currentUser.name)) _kpiRep = sup ? 'all' : currentUser.name;
  const reps = sup ? REPS.slice() : [currentUser.name];
  const r = kpiRange(_kpiPeriod);
  const cards = kpiCards(reps, _kpiPeriod);
  const pct = x => x == null ? '—' : Math.round(x * 100) + '%';
  const color = x => x == null ? 'var(--muted)' : x >= 0.85 ? 'var(--sage-ink)' : x >= 0.6 ? 'var(--amber-ink)' : 'var(--coral-ink)';
  const bar = x => `<div style="height:6px; border-radius:3px; background:var(--paper); overflow:hidden; margin-top:3px;"><div style="width:${x == null ? 0 : Math.round(Math.min(1, x) * 100)}%; height:100%; background:${x == null ? 'transparent' : x >= 0.85 ? 'var(--sage)' : x >= 0.6 ? 'var(--amber)' : 'var(--coral)'};"></div></div>`;
  const chips = (sup ? ['all', ...reps] : reps).map(x => `<div class="chip small ${_kpiRep === x ? 'on' : ''}" onclick="_kpiRep='${esc(x)}'; openKpiScorecard()">${x === 'all' ? 'Team' : esc(x)}</div>`).join('');
  const per = [['month', 'This month'], ['week', 'This week'], ['last', 'Last month']].map(([k, l]) => `<div class="chip small ${_kpiPeriod === k ? 'on' : ''}" onclick="_kpiPeriod='${k}'; openKpiScorecard()">${l}</div>`).join('');
  let body;
  if(_kpiRep === 'all'){
    body = `<div class="card" style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
      <tr><th style="text-align:start; padding:4px;">KPI</th><th style="padding:4px;">Weight</th>${cards.map(c => `<th style="padding:4px;">${esc(c.rep)}</th>`).join('')}</tr>
      <tr style="font-weight:800; font-size:14px;"><td style="padding:4px;">Total score</td><td></td>${cards.map(c => `<td style="text-align:center; padding:4px; color:${color(c.total == null ? null : c.total / 100)};">${c.total == null ? '—' : c.total + '/100'}</td>`).join('')}</tr>
      ${cards[0] ? cards[0].items.map((it, i) => `<tr style="border-top:1px solid var(--line, #eee);"><td style="padding:4px;">${esc(it.label)}</td><td style="text-align:center; color:var(--muted);">${it.weight}%</td>${cards.map(c => `<td style="text-align:center; padding:4px; font-weight:700; color:${color(c.items[i].score)};">${pct(c.items[i].score)}</td>`).join('')}</tr>`).join('') : ''}
      <tr style="border-top:1px solid var(--line, #eee);"><td style="padding:4px; color:var(--muted);">Stands active · checked</td><td></td>${cards.map(c => `<td style="text-align:center; color:var(--muted);">${c.stands.active} · ${c.stands.checked}</td>`).join('')}</tr>
    </table></div>
    <div style="color:var(--muted); font-size:11.5px; margin-top:6px;">Tap a name above for the detail behind every score.</div>`;
  } else {
    const c = cards.find(x => x.rep === _kpiRep) || cards[0];
    body = `<div class="card" style="text-align:center;"><div style="font-size:12px; color:var(--muted);">${esc(c.rep)} · ${r.label} · ${c.workdays} working days</div>
      <div style="font-size:40px; font-weight:800; color:${color(c.total == null ? null : c.total / 100)};">${c.total == null ? '—' : c.total}<span style="font-size:16px; color:var(--muted);">/100</span></div></div>
      ${c.items.map(it => `<div class="card" style="margin-top:8px;">
        <div class="row-between"><b style="font-size:13px;">${esc(it.label)}</b><span style="font-weight:800; color:${color(it.score)};">${pct(it.score)} <span style="color:var(--muted); font-weight:400; font-size:11px;">× ${it.weight}%</span></span></div>
        ${bar(it.score)}
        <div style="font-size:12px; margin-top:4px;">${esc(it.value)}</div>
        <div style="font-size:11.5px; color:var(--muted);">Target: ${esc(it.target)}</div>
        ${it.detail ? `<div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${esc(it.detail)}</div>` : ''}
      </div>`).join('')}
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
function openKpiSettings(){
  if(!requireAdmin()) return;
  const S = kpiSettings();
  const f = (k, label, step) => `<label style="display:block; font-size:12.5px; margin-top:8px;">${label}<input type="number" step="${step || 1}" id="kpi_${k}" value="${S[k]}" style="margin-top:3px;"></label>`;
  showModal(`
    <h3 style="margin-top:0;">${I('settings')} KPI settings</h3>
    ${f('discountA', 'Max discount % – A clinics')}${f('discountOther', 'Max discount % – other clinics')}${f('discountOpenDay', 'Max discount % – open days')}
    <label style="display:block; font-size:12.5px; margin-top:8px;">Open days (dates, comma-separated, e.g. 2026-10-15, 2026-10-22)<input type="text" id="kpi_openDays" value="${esc((S.openDays || []).join(', '))}" style="margin-top:3px;"></label>
    ${f('visitsPerDay', 'Field visits a day')}${f('doctorsPerMonth', 'Different doctors met a month')}${f('newProducts', 'New product placements a month')}${f('newAccounts', 'New accounts a month')}
    ${f('responseHours', 'Answer a client request within (hours)')}${f('returnsMax', 'Max returns (share of sales, e.g. 0.02 = 2%)', 0.005)}${f('rxGrowth', 'Prescription growth a month (e.g. 0.15 = 15%)', 0.01)}
    <div style="display:flex; gap:8px; margin-top:12px;"><button class="btn" onclick="saveKpiSettings()">Save</button><button class="btn secondary" onclick="openKpiScorecard()">Back</button></div>`);
}
async function saveKpiSettings(){
  if(!requireAdmin()) return;
  const S = kpiSettings(), out = {};
  Object.keys(UMCore.KPI_DEFAULTS).forEach(k => {
    const el = document.getElementById('kpi_' + k); if(!el) { out[k] = S[k]; return; }
    if(k === 'openDays') out[k] = el.value.split(/[,\s]+/).map(x => x.trim()).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x));
    else { const v = parseFloat(el.value); out[k] = isFinite(v) && v >= 0 ? v : S[k]; }
  });
  BENCHMARKS = Object.assign({}, BENCHMARKS, { kpi: out });
  if(await persist('benchmarks')) { showToast('✅ KPI settings saved'); openKpiScorecard(); }
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
    ${open.length ? open.map(e => `<div class="card" style="margin-bottom:6px;"><div class="row-between"><b>${esc(cl(e.clinicId))}</b><span style="font-size:11.5px; color:${Date.now() - Date.parse(e.at) > lim * 3600000 ? 'var(--coral-ink)' : 'var(--muted)'};">${age(e)} · ${esc(e.rep || '')}</span></div><div style="font-size:12.5px;">${esc(e.text || '')}</div><button class="chip small" style="margin-top:6px;" onclick="resolveClientLog('${e.id}')">✓ Answered</button></div>`).join('') : '<div style="color:var(--muted); font-size:12.5px;">None open.</div>'}
    <div class="section-title">This month</div>
    ${recent.length ? recent.map(e => `<div style="font-size:12.5px; padding:4px 0; border-bottom:1px solid var(--line, #eee);">${e.type === 'escalation' ? '⚠️ Escalation' : '✓ Request'} · <b>${esc(cl(e.clinicId))}</b> · ${esc(e.rep || '')} · ${fmtDate(String(e.at).slice(0, 10))}${e.via ? ' · went to ' + esc(e.via) : ''}${e.text ? ' — ' + esc(e.text) : ''}${e.resolvedAt ? ' <span style="color:var(--muted);">(answered in ' + Math.max(0, Math.round((Date.parse(e.resolvedAt) - Date.parse(e.at)) / 3600000)) + 'h)</span>' : ''}</div>`).join('') : '<div style="color:var(--muted); font-size:12.5px;">Nothing logged this month.</div>'}
    <div class="section-title">Stands (${stands.length})</div>
    ${stands.length ? stands.map(e => `<div class="card" style="margin-bottom:6px;"><div class="row-between"><b>${esc(cl(e.clinicId))}</b><span style="font-size:11.5px; color:var(--muted);">${esc(e.rep || '')}</span></div><div style="font-size:12.5px;">${esc(e.brand || '')}${e.text ? ' — ' + esc(e.text) : ''}</div><div style="font-size:11.5px; color:var(--muted);">Placed ${fmtDate(String(e.at).slice(0, 10))} · last checked ${(e.checks || []).length ? fmtDate(e.checks[e.checks.length - 1]) : 'never'}</div>
      <div style="display:flex; gap:6px; margin-top:6px;"><button class="chip small" onclick="checkStand('${e.id}')">✓ Checked today</button><button class="chip small" onclick="removeStand('${e.id}')">Removed</button></div></div>`).join('') : '<div style="color:var(--muted); font-size:12.5px;">No stands recorded.</div>'}
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
    <div style="display:flex; gap:8px; margin-top:12px;"><button class="btn" onclick="saveClientLog('${kind}')">Save</button><button class="btn secondary" onclick="openClientLog()">Back</button></div>`);
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
  if(await persist('events')) showToast('✅ Stand checked'); openClientLog();
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
  await persist('clinics');
  showToast(`${c.name}: ${c.gov ? 'government account – visited every week' : 'not a government account'}`);
  renderAdminTerritory();
}
