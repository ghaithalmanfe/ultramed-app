// change log (audit trail): who changed what, when, from what to what, why, and whether the save landed
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- CHANGE LOG / سجل التغييرات ----
// Every change a person makes to the team's records — visits and orders,
// clinics (add, edit, close, delete, handover, shared, government), doctors,
// the team and its roles, targets, sales files and ERP account links,
// products, restores and the recycle bin — leaves one entry: who (name and
// role), when, the action, which record (key, id, a readable label), what
// changed (before → after: the changed fields only, cut short — never a whole
// document, never a password or a token), the reason when one was given, and
// what the save did: saved, kept on this phone (it uploads by itself), not
// saved, no confirmation from the cloud, or refused because the record
// changed elsewhere first. An entry is written AFTER its save settled, from
// that save's own outcome (persistTold / persistFor, 04), so the log never
// says "saved" for a save that did not land.
//
// Best effort, never in the way: auditRecord never throws and never waits for
// the cloud. The entry goes into this phone's queue (localStorage
// um_auditQueue — memory when the phone's storage is full) and up to the
// month's document `auditLog:YYYY-MM` in the background, one append at a
// time, through the same atomic read-merge-write as the merge-safe lists
// (storageUpdate → a Firestore transaction; UMCore.auditAppend is the merge).
// An append that fails stays queued and is retried with the next change, at
// every refresh and when the connection comes back; an entry is added once
// whatever the retries (its eid). The month document is capped
// (UMCore.AUDIT_LIMITS): past the cap the oldest entries keep who / what /
// when / result and lose their before → after, and only then go — counted,
// and said on the screen.
//
// ERP account links already have their own log (erpMapLog, 11-erp.js): a
// confirmed link change is written there only, and this screen reads it
// (UMCore.auditFromErpMapLog). What erpMapLog never holds — a link save that
// did not land — is written here.
//
// What this log can and cannot promise. The app only ever appends: persist()
// refuses an auditLog key, no screen edits or deletes an entry, backups and
// restores never touch these documents, and an unreadable month is never
// written over. That protects the log from ORDINARY modification only. The
// Firestore rules give every signed-in phone the same right to write any
// state document, and the log's value is one JSON string the rules cannot
// parse — so they cannot tell an append from a rewrite. A determined team
// member could still rewrite or delete a month document with the SDK or the
// Firebase console, and a phone records what its own copy of the app reports
// (a modified copy could log nothing, or something untrue). The rules could
// narrow it — e.g. `allow delete: if !(doc.matches('auditLog:.*'))` on
// /state/{doc} — but not make it append-only. A log the team cannot alter
// needs the server: a Cloud Function on every write to state/{doc} (admin
// rights, the server's clock, the caller's auth uid, whatever the app
// version) appending the before → after it sees to a separate `audit`
// collection whose rules are `allow write: if false` (only the function
// writes; reads for the supervisor), optionally exported daily to a
// retention-locked Cloud Storage bucket. Until then this client log is the
// team's honest record of what the app did, not proof against tampering.
const AUDIT_QUEUE_KEY = 'um_auditQueue';   // entries this phone has not got into the cloud yet: [{ m: 'YYYY-MM', e }]
const AUDIT_QUEUE_MAX = 300;
let AUDIT_WRITE_MS = 8000;
let _auditMem = [];                        // the same, while the phone's storage is full
let _auditChain = Promise.resolve();
let _auditLost = 0;                        // entries pushed out of a full queue (said on the screen)
function auditQueueRead(){
  try{
    const q = JSON.parse(localStorage.getItem(AUDIT_QUEUE_KEY) || '[]');
    return Array.isArray(q) ? q.filter(x => x && x.e && typeof x.e === 'object' && x.e.eid && /^\d{4}-\d{2}$/.test(x.m || '')) : [];
  }catch(e){ return []; }
}
function auditQueueWrite(q){ try{ localStorage.setItem(AUDIT_QUEUE_KEY, JSON.stringify(q)); return true; }catch(e){ return false; } }
// Every entry still waiting on this phone (the device queue, then memory).
function auditPending(){
  const q = auditQueueRead(), have = new Set(q.map(x => x.e.eid));
  return q.concat(_auditMem.filter(x => !have.has(x.e.eid)));
}
// What a save did → { ok, res }. r: true / false, a persistTold or persistFor
// result ({ ok, outcome }), or { res } for an outcome said in words.
function auditOutcome(r, key){
  if(r && typeof r === 'object' && typeof r.res === 'string') return { ok: r.res === 'saved', res: r.res };
  if(r === true) return { ok: true, res: 'saved' };
  if(r && typeof r === 'object' && 'ok' in r){
    if(r.ok === true || (key && r.outcome && typeof sentSince === 'function' && sentSince(key, r))) return { ok: true, res: 'saved' };
    const o = r.outcome || {};
    return { ok: false, res: o.queued ? 'queued' : 'failed' };
  }
  return { ok: false, res: 'failed' };
}
// Records one change: o = { action, key, id, label, before, after, reason,
// result } — before / after as the record's fields (only what changed is
// kept: UMCore.auditDiff), result = what the save did (auditOutcome). Call it
// once the save has settled; do not wait for it. Returns the entry, or null
// (nothing changed, or nothing could be recorded — the action goes on).
function auditRecord(o){
  try{
    if(!o || !o.action || typeof UMCore.auditEntry !== 'function') return null;
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    let before = o.before == null ? null : o.before, after = o.after == null ? null : o.after;
    if(o.diff !== false && (isObj(before) || isObj(after))){
      const d = UMCore.auditDiff(isObj(before) ? before : null, isObj(after) ? after : null, { fields: o.fields, ignore: o.ignore });
      if(isObj(before) && isObj(after) && !d.n && !o.keepEmpty) return null; // saved with nothing changed: no entry
      before = d.before; after = d.after;
    }
    const out = auditOutcome(o.result, o.key);
    const e = UMCore.auditEntry({ action: o.action, key: o.key, id: o.id, label: o.label, before, after, reason: o.reason, res: out.res },
      { by: currentUser ? currentUser.name : null, role: currentUser ? currentUser.role : null });
    const m = UMCore.localDateStr(new Date(e.at)).slice(0, 7);
    const q = auditQueueRead();
    q.push({ m, e });
    while(q.length > AUDIT_QUEUE_MAX){ q.shift(); _auditLost++; }
    if(!auditQueueWrite(q)){ _auditMem.push({ m, e }); while(_auditMem.length > AUDIT_QUEUE_MAX){ _auditMem.shift(); _auditLost++; } }
    auditFlush();
    return e;
  }catch(err){ console.warn('change log: not recorded', err); return null; }
}
// Sends what this phone holds up to the month documents, one append at a
// time. Never rejects. An entry leaves the queue only once the cloud has it.
function auditFlush(){
  const run = async () => {
    if(!currentUser || typeof UMCore.auditAppend !== 'function') return;
    const pend = auditPending();
    if(!pend.length) return;
    const byMonth = {};
    pend.forEach(x => { (byMonth[x.m] = byMonth[x.m] || []).push(x.e); });
    for(const m of Object.keys(byMonth).sort()){
      const list = byMonth[m];
      let broken = false;
      try{
        await storageUpdate(UMCore.AUDIT_PREFIX + m, cur => { const r = UMCore.auditAppend(cur, list, { month: m }); broken = !!r.broken; return r.value; }, AUDIT_WRITE_MS);
      }catch(e){ console.warn('change log: not uploaded yet (' + m + ')', e && e.message); break; } // no connection: the rest waits too
      // written — or nothing new (a retry of entries already there): either way in the cloud
      if(broken){ console.error('change log: ' + UMCore.AUDIT_PREFIX + m + ' holds something else — never written over; its entries stay on this phone'); continue; }
      const done = new Set(list.map(e => e.eid));
      auditQueueWrite(auditQueueRead().filter(x => !done.has(x.e.eid)));
      _auditMem = _auditMem.filter(x => !done.has(x.e.eid));
    }
  };
  _auditChain = _auditChain.then(run, run).catch(e => console.warn('change log flush', e));
  return _auditChain;
}

// ---- the fields each kind of record shows in the log ----
// These run in the save paths, so none of them may ever throw: odd data gives
// null (the entry then has fewer details), never a stopped save or toast.
function auditSafe(fn){ return function(){ try{ return fn.apply(null, arguments); }catch(e){ console.warn('change log: fields', e); return null; } }; }
const auditDoctorNameIn = auditSafe((c, v, id) => {
  const d = c && (c.doctors || []).find(x => x && x.id === id);
  return d && d.name ? d.name : (v && v.doctorNames && v.doctorNames[id]) || null;
});
const auditVisitFields = auditSafe(v => {
  if(!v) return null;
  const c = clinics.find(x => x && x.id === v.clinicId);
  const ids = Array.isArray(v.doctorIds) && v.doctorIds.length ? v.doctorIds : (v.doctorId ? [v.doctorId] : []);
  const one = Array.isArray(v.orders) && v.orders.length === 1 ? v.orders[0] : null;
  // the rep only when it is not the person making the change (the entry's `by` already says it)
  const f = { date: v.date || null, rep: v.rep && !(currentUser && currentUser.name === v.rep) ? v.rep : null, withRep: v.withRep || null,
    met: ids.map(id => auditDoctorNameIn(c, v, id) || 'a doctor no longer listed'),
    channel: v.callOnly ? (v.channel || 'call') : null, contactName: v.contactName || null,
    orderTotal: v.orderTaken ? (v.orderTotal || 0) : null, items: v.orderTaken ? ((v.orderItems || []).length || null) : null,
    discountPct: v.orderTaken && one && one.discountPct ? one.discountPct : null,
    rx: null, nextFollowUp: v.nextFollowUp || null, notes: v.notes || null, noOrderReason: v.noOrderReason || null,
    photos: (v.photos || []).length || null };
  try{
    const lines = UMCore.visitRxLines(v);
    if(lines.length) f.rx = UMCore.rxText(lines, { list: UMCore.rxTypeList(rxTypesDoc), doctorName: id => auditDoctorNameIn(c, v, id) });
  }catch(e){}
  return f;
});
const auditVisitLabel = auditSafe(v => v ? (clinicNameOf(v.clinicId, v) + (v.date ? ' · ' + v.date : '')) : null);
function auditVisitAction(v, verb){ return (v && v.orderOnly ? 'order.' : (v && v.callOnly && verb === 'add') ? 'call.' : 'visit.') + verb; }
const auditClinicFields = auditSafe(c => {
  if(!c) return null;
  return { name: c.name || null, rep: c.rep || null, cls: c.cls || null, account: c.account || null, dealType: c.dealType || null,
    contact: c.contact || null, phone: c.phone || null, shared: c.shared ? true : null, sharedSince: c.sharedSince || null,
    gov: c.gov == null ? null : !!c.gov, prevRep: c.prevRep || null, repSince: c.repSince || null };
});
const AUDIT_DOC_KEYS = ['name', 'title', 'role', 'influence', 'stage', 'phone', 'whatsapp', 'email', 'birthday', 'cadence', 'bestTime', 'interests', 'competitor', 'nextStep', 'notes'];
const auditDoctorFields = auditSafe(d => {
  if(!d) return null;
  const f = {};
  AUDIT_DOC_KEYS.forEach(k => { f[k] = d[k] == null || d[k] === '' ? null : d[k]; });
  f.handovers = (d.handovers || []).length || null;
  return f;
});
const auditDoctorLabel = auditSafe((c, d) => (d && d.name ? d.name : '—') + (c && c.name ? ' · ' + c.name : ''));
const auditStaffFields = auditSafe(s => {
  if(!s) return null;
  return { name: s.name || null, role: s.role || null, email: s.email || null, sells: s.role === 'supervisor' ? s.sells !== false : null };
});
const auditProductFields = auditSafe(p => {
  if(!p) return null;
  return { name: p.name || null, brand: p.brand || null, code: p.id == null ? null : String(p.id), price: p.price == null ? null : p.price,
    desc: p.desc || null, specialties: (p.specialties || []).length ? p.specialties.slice() : null, salesNotes: p.salesNotes || null };
});
// { revenue: { person: KD }, visits: { person: n } } of the monthly targets, for the people given
const auditTargetFields = auditSafe((t, people) => {
  const out = { revenue: {}, visits: {} };
  (people || []).forEach(r => { const x = (t || {})[r] || {}; out.revenue[r] = x.revenue || 0; out.visits[r] = x.visits || 0; });
  return out;
});
// Doctors a clinic just gained (addDoctorsToClinic's newIds): one entry each.
const auditDoctorsAdded = auditSafe((c, r, result) => {
  ((r && r.newIds) || []).forEach(id => {
    const d = ((c && c.doctors) || []).find(x => x && x.id === id);
    if(d) auditRecord({ action: 'doctor.add', key: 'clinics', id: c.id + '|' + id, label: auditDoctorLabel(c, d), after: auditDoctorFields(d), result });
  });
  return true;
});
// A sales file saved (or not): its dates, net, lines, whose salesmen, how many older files it replaced.
const auditSalesImport = auditSafe((period, replaced, ok) => {
  if(!period) return null;
  const sm = Object.keys(period.repMap || {}).map(k => k + (period.repMap[k] ? ' → ' + period.repMap[k] : ''));
  auditRecord({ action: 'sales.import', key: 'erpSales', id: period.id, label: period.from + ' – ' + period.to,
    after: { from: period.from, to: period.to, net: period.net, lines: period.rowCount || null, salesman: sm, replaced: replaced || null }, result: ok });
  return true;
});
// { field: { person: value } } before and after: keep only the people whose value changed (in place).
const auditPeopleChanged = auditSafe((was, now) => {
  if(!was || !now) return null;
  Object.keys(Object.assign({}, was, now)).forEach(f => {
    const a = was[f] || {}, b = now[f] || {};
    Object.keys(Object.assign({}, a, b)).forEach(p => { if(a[p] === b[p]){ delete a[p]; delete b[p]; } });
  });
  return true;
});
// What a free-text reason box holds (the sheet may be gone — then no reason).
const auditReasonFrom = auditSafe(id => { const el = document.getElementById(id); return el && el.value ? el.value.trim().slice(0, 300) : null; });

// ---- the screen: More → Change log ----
// A supervisor sees everyone's entries (filter by person); a rep only her own
// (UMCore.auditView enforces it whatever the filters). Newest first; one
// month at a time (one document read); this phone's entries still waiting to
// upload are shown with them, marked; a month that could not be read says so
// — never "no changes".
let _cl = null; // { month, by, group, failed, limit, seq, data }
const AUDIT_KEY_LABELS = { visits: 'Visits', clinics: 'Clinics', tasks: 'Tasks', events: 'Calendar events', dayPlans: 'Day plans', tombs: 'Deletions', chat: 'Team chat', memories: 'Memories' };
const AUDIT_KIND_LABELS = { clinics: 'Clinic', products: 'Product', visits: 'Visit' };
// A reason the app gives itself is stored as a code ('#…') and shown in the reader's language.
const AUDIT_REASON_CODES = { '#undo-erp-link': 'Undo of an ERP account link change' };
// A label map read with a key from stored data: own entries only (a stored "constructor" is not a label).
function auditOwn(map, k){ return typeof k === 'string' && Object.prototype.hasOwnProperty.call(map, k); }
const AUDIT_GROUP_ORDER = ['visits', 'clinics', 'doctors', 'team', 'targets', 'sales', 'products', 'restore', 'sync'];
function clMonths(){
  const out = [], d = new Date(); d.setDate(1);
  for(let i = 0; i < 6; i++){ out.push(UMCore.localDateStr(d).slice(0, 7)); d.setMonth(d.getMonth() - 1); }
  return out;
}
function openChangeLog(){
  if(!currentUser) return;
  if(typeof UMCore.auditView !== 'function'){ showToast('⚠️ Update the app first — open it twice'); return; }
  const sup = currentUser.role === 'supervisor';
  _cl = { month: todayStr().slice(0, 7), by: 'all', group: 'all', failed: false, limit: 50, seq: 0, data: null };
  showModal(`
    <h3 style="margin-top:0;">${I('shield')} <span>Change log</span></h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-6px;"><span>${sup ? 'Who changed what, when, from what to what — and whether the save landed.' : 'Your own changes: what, when, from what to what — and whether the save landed.'}</span></p>
    <div class="chip-row" id="clMonths" style="margin-bottom:6px;">${clMonths().map(m => `<div class="chip small ${m === _cl.month ? 'on' : ''}" data-m="${m}" onclick="clPickMonth(this.dataset.m)">${esc(monthLabel(m))}</div>`).join('')}</div>
    <div id="clFilters"></div>
    <div id="clBody"></div>
    <button class="btn secondary" style="margin-top:8px;" onclick="closeModal()">Close</button>`);
  clLoad();
}
async function auditReadMonth(m){
  try{
    const r = await withTimeout(window.storage.get(UMCore.AUDIT_PREFIX + m, true), 8000);
    return { ok: true, doc: UMCore.auditDocOf(r ? r.value : null, m) };
  }catch(e){ console.warn('change log: not read', e && e.message); return { ok: false, doc: null }; }
}
async function auditReadErpLog(){
  try{
    const r = await withTimeout(window.storage.get('erpMapLog', true), 8000);
    const v = UMCore.safeParse(r && r.value, []);
    return { ok: true, list: Array.isArray(v) ? v : [] };
  }catch(e){ return { ok: false, list: [] }; }
}
async function clLoad(){
  const st = _cl;
  if(!st || !currentUser) return;
  const seq = ++st.seq, m = st.month, sup = currentUser.role === 'supervisor';
  st.data = null;
  clRender();
  const [doc, erp] = await Promise.all([auditReadMonth(m), sup ? auditReadErpLog() : Promise.resolve({ ok: true, list: [] })]);
  if(_cl !== st || st.seq !== seq || st.month !== m) return; // the person moved on
  st.data = { doc, erp };
  clRender();
}
function clPickMonth(m){
  if(!_cl || !/^\d{4}-\d{2}$/.test(m || '')) return;
  _cl.month = m; _cl.limit = 50;
  document.querySelectorAll('#clMonths .chip').forEach(c => c.classList.toggle('on', c.dataset.m === m));
  clLoad();
}
function clPick(k, v){
  if(!_cl || !['by', 'group', 'failed'].includes(k)) return;
  _cl[k] = k === 'failed' ? !!v : String(v == null ? 'all' : v);
  _cl.limit = 50;
  clRender();
}
function clMore(){ if(_cl){ _cl.limit += 50; clRender(); } }
function clFiltersHTML(all, sup){
  const st = _cl;
  let h = '';
  if(sup){
    const names = [...new Set(staff.map(s => s && s.name).concat(all.map(e => e.by)).filter(n => typeof n === 'string' && n))];
    h += `<div class="chip-row" id="clPeople" style="margin-bottom:6px;"><div class="chip small ${st.by === 'all' ? 'on' : ''}" data-by="all" onclick="clPick('by', this.dataset.by)"><span>Everyone</span></div>${names.map(n =>
      `<div class="chip small ${st.by === n ? 'on' : ''}" data-by="${esc(n)}" onclick="clPick('by', this.dataset.by)"><bdi dir="auto">${esc(n)}</bdi></div>`).join('')}</div>`;
  }
  h += `<div class="chip-row" id="clGroups" style="margin-bottom:8px;"><div class="chip small ${st.group === 'all' ? 'on' : ''}" data-g="all" onclick="clPick('group', this.dataset.g)"><span>All changes</span></div>${AUDIT_GROUP_ORDER.map(g =>
    `<div class="chip small ${st.group === g ? 'on' : ''}" data-g="${g}" onclick="clPick('group', this.dataset.g)"><span>${esc(UMCore.AUDIT_GROUP_LABELS[g])}</span></div>`).join('')}<div class="chip small ${st.failed ? 'on' : ''}" data-failed="1" onclick="clPick('failed', !_cl.failed)"><span>Not saved only</span></div></div>`;
  return h;
}
function clWhen(at){
  const d = new Date(at);
  if(isNaN(d.getTime())) return clS(at);
  try{ return d.toLocaleString(uiLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch(e){ return String(at); }
}
function clVal(v, field){
  if(field === 'link'){
    if(v == null) return '<span>not linked</span>';
    if(v === '@channel') return '<span>online / channel</span>';
    if(v === '@ignore') return '<span>ignored</span>';
  }
  if(v === true) return '<span>Yes</span>';
  if(v === false) return '<span>No</span>';
  if(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '<span style="color:var(--muted);">—</span>';
  if(field === 'role' && (v === 'rep' || v === 'supervisor')) return `<span>${v === 'rep' ? 'Sales Rep' : 'Supervisor'}</span>`;
  if(field === 'kind' && auditOwn(AUDIT_KIND_LABELS, v)) return `<span>${AUDIT_KIND_LABELS[v]}</span>`;
  if(field === 'salesman' && v === 'ignored') return '<span>ignored</span>';
  if(field === 'policy' && (v === 'erp' || v === 'origin')) return `<span>${v === 'erp' ? 'the month it was booked' : "the original invoice's month"}</span>`;
  return `<bdi dir="auto" style="overflow-wrap:anywhere;">${esc(UMCore.auditText(v))}</bdi>`;
}
function clChangesHTML(e){
  if(e.before === '…' || e.after === '…') return '<div style="color:var(--muted); font-size:12px; margin-top:4px;"><span>Details too long to keep.</span></div>';
  const ch = UMCore.auditChanges(e);
  if(!ch.length) return '';
  const both = e.before != null && e.after != null, arrow = uiLang === 'ar' ? '←' : '→';
  const label = f => auditOwn(UMCore.AUDIT_FIELDS, f) ? `<span>${esc(UMCore.AUDIT_FIELDS[f])}</span>` : `<bdi dir="auto">${esc(clS(f))}</bdi>`;
  return `<div style="font-size:12.5px; margin-top:6px; line-height:1.6;">${ch.slice(0, 16).map(c =>
    `<div data-field="${esc(clS(c.field))}">${label(c.field)}: ${both ? clVal(c.from, c.field) + ` <span aria-hidden="true">${arrow}</span> ` + clVal(c.to, c.field) : clVal(e.after != null ? c.to : c.from, c.field)}</div>`).join('')}</div>`;
}
// Entries come from a shared document: every value is shown as text, and one
// odd entry shows as unreadable instead of taking the list down with it.
function clS(x){ return x == null ? '' : String(x); }
function clEntryHTML(e, pending){
  try{
    const ok = e.ok === true, queued = e.res === 'queued';
    const action = auditOwn(UMCore.AUDIT_ACTIONS, e.action) ? UMCore.AUDIT_ACTIONS[e.action] : clS(e.action);
    const res = auditOwn(UMCore.AUDIT_RESULTS, e.res) ? UMCore.AUDIT_RESULTS[e.res] : (ok ? 'Saved' : 'Not saved');
    const role = e.role === 'supervisor' ? 'Supervisor' : e.role === 'rep' ? 'Sales Rep' : '';
    const label = e.action === 'sync.upload' && auditOwn(AUDIT_KEY_LABELS, e.key) ? `<div style="font-weight:600; font-size:13px; margin-top:4px;"><span>${AUDIT_KEY_LABELS[e.key]}</span></div>`
      : e.label ? `<div dir="auto" style="font-weight:600; font-size:13px; margin-top:4px; overflow-wrap:anywhere;">${esc(clS(e.label))}</div>` : '';
    const why = e.reason ? `<div style="font-size:12.5px; margin-top:4px;"><span>Reason</span>: ${auditOwn(AUDIT_REASON_CODES, e.reason) ? `<span>${AUDIT_REASON_CODES[e.reason]}</span>` : `<bdi dir="auto" style="overflow-wrap:anywhere;">${esc(clS(e.reason))}</bdi>`}</div>` : '';
    return `<div class="card" data-audit="${esc(clS(e.eid))}" data-action="${esc(clS(e.action))}" data-res="${esc(clS(e.res))}" style="padding:10px 12px; margin-bottom:8px; border-inline-start:4px solid ${ok ? 'var(--sage)' : queued ? 'var(--amber)' : 'var(--coral)'};">
    <div class="row-between" style="gap:8px; align-items:flex-start;"><b style="font-size:13.5px;"><span>${esc(action)}</span></b><span class="badge ${ok ? 'done' : queued ? 'today' : 'overdue'}"><span>${esc(res)}</span></span></div>
    <div class="clinic-sub" style="margin-top:2px;"><bdi dir="auto">${esc(clS(e.by) || '—')}</bdi>${role ? ` · <span>${role}</span>` : ''} · <span dir="auto">${esc(clWhen(e.at))}</span></div>
    ${label}${clChangesHTML(e)}${why}
    ${e.trimmed ? '<div style="color:var(--muted); font-size:11.5px; margin-top:4px;"><span>Details removed to keep the month under the size limit.</span></div>' : ''}
    ${pending ? '<div style="color:var(--amber-ink); font-size:11.5px; margin-top:4px;">⏳ <span>Recorded on this phone — waiting to upload to the change log.</span></div>' : ''}
    ${e.src === 'erpMapLog' ? '<div style="color:var(--muted); font-size:11.5px; margin-top:4px;"><span>From the ERP account-link log.</span></div>' : ''}
  </div>`;
  }catch(err){
    console.warn('change log: an entry could not be shown', err);
    return '<div class="card" style="padding:10px 12px; margin-bottom:8px; color:var(--muted); font-size:12.5px;"><span>An entry that could not be read.</span></div>';
  }
}
function clRender(){
  const st = _cl, body = document.getElementById('clBody'), filters = document.getElementById('clFilters');
  if(!st || !body || !currentUser) return;
  if(!st.data){ body.innerHTML = '<div style="color:var(--muted); font-size:13px; padding:6px 0;"><span>Reading the change log…</span></div>'; return; }
  const sup = currentUser.role === 'supervisor', { doc, erp } = st.data;
  const cloud = doc.ok && doc.doc ? doc.doc.entries : [];
  const inCloud = new Set(cloud.map(e => e.eid));
  const waiting = auditPending().filter(x => x.m === st.month && !inCloud.has(x.e.eid)).map(x => x.e);
  const waitIds = new Set(waiting.map(e => e.eid));
  const erpList = sup && erp.ok ? UMCore.auditFromErpMapLog(erp.list, st.month) : [];
  const all = cloud.concat(erpList, waiting);
  if(filters) filters.innerHTML = clFiltersHTML(all, sup);
  const list = UMCore.auditView(all, { viewer: { name: currentUser.name, role: currentUser.role }, by: st.by, group: st.group, failed: st.failed });
  const notes = [];
  if(!doc.ok) notes.push(`<div class="card" id="clReadErr" style="border-inline-start:4px solid var(--coral); font-size:12.5px; margin-bottom:8px;"><span>The change log of this month could not be read — check the connection and try again.</span> <button class="chip small" onclick="clLoad()"><span>Try again</span></button></div>`);
  else if(doc.doc.broken) notes.push(`<div class="card" style="border-inline-start:4px solid var(--coral); font-size:12.5px; margin-bottom:8px;"><span>This month's change log holds something the app cannot read — nothing was written over it.</span></div>`);
  if(sup && !erp.ok) notes.push(`<div class="nudge" style="margin-bottom:8px;"><span>ERP account link changes could not be read right now.</span></div>`);
  const mine = sup ? null : currentUser.name;
  const nWait = waiting.filter(e => !mine || e.by === mine).length;
  if(nWait) notes.push(`<div class="nudge" style="margin-bottom:8px;">⏳ ${nWait} <span>changes recorded on this phone are waiting to upload to the change log.</span></div>`);
  if(doc.ok && doc.doc && (doc.doc.trimmed || doc.doc.dropped)) notes.push(`<div class="nudge" style="margin-bottom:8px;">${doc.doc.trimmed ? `${doc.doc.trimmed} <span>older entries of this month keep who, what and when only — their before → after was removed to stay under the cloud's size limit.</span> ` : ''}${doc.doc.dropped ? `${doc.doc.dropped} <span>of the oldest entries of this month are no longer kept.</span>` : ''}</div>`);
  if(_auditLost && st.month === todayStr().slice(0, 7)) notes.push(`<div class="nudge" style="margin-bottom:8px;">${_auditLost} <span>entries could not be kept on this phone while it was offline for long.</span></div>`);
  let html = notes.join('');
  if(list.length){
    html += list.slice(0, st.limit).map(e => clEntryHTML(e, waitIds.has(e.eid))).join('');
    if(list.length > st.limit) html += `<button class="btn secondary small" onclick="clMore()"><span>Show more</span> (${list.length - st.limit})</button>`;
  } else if(doc.ok){
    html += `<div class="empty" id="clEmpty"><span>${all.length ? 'No changes match these filters.' : sup ? 'No changes recorded in this month.' : 'You made no recorded changes in this month.'}</span></div>`;
  }
  body.innerHTML = html;
}
