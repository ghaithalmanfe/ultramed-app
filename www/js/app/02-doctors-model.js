// doctor record model
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- DOCTOR RECORDS: the card a rep fills per doctor (labels live in core) ----
const DOC_ROLE_LABEL = Object.fromEntries(UMCore.DOC_ROLES);
const DOC_INFLUENCE_LABEL = Object.fromEntries(UMCore.DOC_INFLUENCE);
const DOC_STAGE_LABEL = Object.fromEntries(UMCore.DOC_STAGES);
const DOC_STAGE_COLOR = {new:'var(--muted)', met:'#FF9500', warm:'var(--teal)', champion:'var(--sage-ink)', blocked:'var(--coral-ink)'};
const DOC_INFLUENCE_ICON = {decider:'👑', influencer:'🗣️', user:'🦷', gatekeeper:'🚪'};
function docBadges(d){
  const b = [];
  if(d.influence) b.push(`<span class="badge upcoming">${DOC_INFLUENCE_ICON[d.influence]||''} ${esc(DOC_INFLUENCE_LABEL[d.influence]||d.influence)}</span>`);
  if(d.role) b.push(`<span class="badge" style="background:var(--paper);">${esc(DOC_ROLE_LABEL[d.role]||d.role)}</span>`);
  if(d.stage) b.push(`<span class="badge" style="background:var(--paper); color:${DOC_STAGE_COLOR[d.stage]||'inherit'}; font-weight:700;">${esc(DOC_STAGE_LABEL[d.stage]||d.stage)}</span>`);
  return b.length ? `<div class="chip-row" style="gap:4px; margin-top:4px;">${b.join('')}</div>` : '';
}
const NO_ORDER_REASONS = ['Still has stock','Price too high','Prefers competitor','Decision maker away','Needs samples first','Budget/approval pending','Just introducing','Payment issue pending','Not interested'];
let noOrderReason = null;
let selectedClinicId = null;
let selectedDoctorIds = []; // contacts met during the visit (multi-select)
let newClinicMode = false;
let welcomeDismissed = false;
const ACCOUNT_TYPES = ['Credit account','Cash based'];

let clinics = [];
// Rows the data-repair sweeps had to invent ("⚠️ Restored clinic — rename me")
// stay in the cloud copy (so merges and the wipe guard keep counting them) but
// are never shown or counted anywhere in the UI.
let hiddenPlaceholderClinics = [];
function isPlaceholderClinic(c){ return !!(c && /restored clinic|re(?:name|store)\s*me/i.test(c.name||'')); }
function hidePlaceholderClinics(){
  if(!Array.isArray(clinics)) return;
  const keep = [], hide = [];
  clinics.forEach(c=> (isPlaceholderClinic(c) ? hide : keep).push(c));
  clinics = keep;
  // newest copy of each hidden row wins; a row that came back visible (renamed
  // elsewhere) drops out of the hidden set so it is never stored twice
  const byId = new Map(hiddenPlaceholderClinics.map(h=>[h.id, h]));
  hide.forEach(h=>byId.set(h.id, h));
  keep.forEach(c=>byId.delete(c.id));
  hiddenPlaceholderClinics = Array.from(byId.values());
}
// The full clinic list as it must be written to the cloud/mirror/snapshots
function storedClinics(){
  const ids = new Set(clinics.map(c=>c.id));
  return clinics.concat(hiddenPlaceholderClinics.filter(h=>!ids.has(h.id)));
}
let products = [];
let visits = [];
let tasks = [];
let dayPlans = {};
let selectedProducts = [];
let draftOrders = [];
let orderTaken = false;
let reportRange = 30; // management default: the month, matching targets & ERP dashboards
let reportCustom = null; // {from, to} when a custom date range is active
let clinicRepFilter = 'mine';
let reportRepFilter = 'mine';
let logAsRep = null;
let uiLang = (function(){ try{ return localStorage.getItem('ultramed_lang')==='ar' ? 'ar' : 'en'; }catch(e){ return 'en'; } })();
let jointRep = null; // second team member on a joint (double) visit
let currentUser = null;
let recycleBin = {clinics:[], products:[], visits:[]};
let events = [];
let targets = {}; // {repName: {revenue: KD, visits: N}} — monthly targets
let categoryGuides = {}; // {catName: {sell, how, objections, links[]}} — selling guides
let erpSales = {periods: []}; // imported ERP sales periods (supervisor)
let erpMap = {}; // {erpCustomerName: clinicId | '@channel' | '@ignore'}
// Links are saved one account at a time (saveErpLink, 11-erp.js): a counter of
// confirmed link saves, so a refresh whose read started before a save never
// brings the old link back, and a flag while a link save is in flight.
let _erpMapGen = 0, _erpLinkSaving = false;
// The supervisor's prescription types (state/rxTypes: {v, rev, by, at, types})
// as last read or confirmed; null = none saved yet (the owner's two printed
// forms are used — UMCore.rxTypeList). Saved only by saveRxTypes (10), a
// compare-and-set; a counter of confirmed saves keeps a refresh that started
// before a save from bringing the old list back.
let rxTypesDoc = null;
// Has this phone ever read the team's prescription-type list from the cloud
// (or a device copy of it)? 'unknown' until the first read answers, 'failed'
// while every read so far failed, 'read' once one answered. Unlike
// _loadFailed (reset at the start of every refresh), it does not flip back
// while a slow refresh is still reading.
let _rxTypesRead = 'unknown';
let _rxTypesGen = 0, _rxSaving = false;
// Justifications the team writes against ERP events, keyed by kind:
//   'ret|<doc>|<product>' / 'foc|<doc>|<product>'  → {text, by, on}
// Keys survive re-imports because doc numbers are stable in the ERP.
let erpNotes = {};
let calMode = 'month';
let calAnchor = null;   // set on first render
let calSelected = null;
let calRepFilter = 'all';

// Shared pure helpers live in js/core.js (UMCore) so automated tests can
// exercise them; these thin wrappers keep the existing call sites working.
function uid(){ return UMCore.uid(); }
function todayStr(){ return UMCore.todayStr(); }
function uiLocale(){ return uiLang === 'ar' ? 'ar-KW-u-nu-latn' : 'en-US'; }
function fmtDate(d){
  if(uiLang !== 'ar') return UMCore.fmtDate(d);
  try{ return new Date(d+'T00:00:00').toLocaleDateString('ar-KW-u-nu-latn', {month:'short', day:'numeric'}); }
  catch(e){ return UMCore.fmtDate(d); }
}
function daysBetween(a,b){ return UMCore.daysBetween(a,b); }
const SAVE_MSGS = ['\u2705 Visit logged \u2014 momentum','\u{1F4AA} Logged. Onto the next one','\u{1F525} Another one in the books','\u2728 Saved \u2014 consistency wins','\u{1F680} Logged. Keep rolling','\u{1F3AF} Visit captured \u2014 nice work'];
function visitSavedMsg(){ return SAVE_MSGS[Math.floor(Math.random()*SAVE_MSGS.length)]; }
// A toast stays 1.8 s; a message the person must be able to read (a save that
// finished after they moved on to another sheet) can ask for longer. Each toast
// owns the timer, so an earlier, shorter one never cuts a later one short.
let _toastTimer = null;
function showToast(msg, ms){ const t = document.getElementById('toast'); t.textContent = trOf(msg) || msg; t.classList.add('show'); clearTimeout(_toastTimer); _toastTimer = setTimeout(()=>t.classList.remove('show'), ms || 1800); }
function esc(s){ return UMCore.esc(s); }
// Chrome icon helper — renders one symbol from the inline sprite at text size
function I(name){ return `<svg class="svgi" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function safeUrl(u){ return UMCore.safeUrl(u); }
function initials(n){ return UMCore.initials(n); }
function money(n){ return UMCore.money(n); }

