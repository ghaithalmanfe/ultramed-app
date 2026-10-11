// the visit form, joint visits, order form, follow-up automation
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- LOG VISIT ----
function renderLogHistory(){
  const el = document.getElementById('logHistory');
  if(!el) return;
  const list = [...visibleVisits()].sort((a,b)=>(b.ts||0)-(a.ts||0) || b.date.localeCompare(a.date)).slice(0,12);
  if(!list.length){ el.innerHTML = '<div class="empty">No visits logged yet.</div>'; return; }
  el.innerHTML = list.map(v=>{
    const c = clinics.find(x=>x.id===v.clinicId);
    return `<div class="card" style="padding:10px 14px;">
      <div class="row-between">
        <div>
          <div class="clinic-name" style="font-size:13.5px;">${v.callOnly?(CHANNEL_LABELS[v.channel]||'📞')+' ':''}${v.orderOnly?'🛒 ':''}${esc(clinicNameOf(v.clinicId))}</div>
          <div class="clinic-sub">${fmtDate(v.date)} · ${esc(v.rep)}${jointTag(v)}${v.orderTaken?' · '+money(v.orderTotal):''}${rxShortHTML(v)}</div>
        </div>
        ${canEditVisit(v)?`<button class="chip small" onclick="openEditVisit('${v.id}')">${I('pencil')}</button>`:''}
      </div>
    </div>`;
  }).join('');
}
// Who a visit can be filed under. A supervisor visits clinics too, so his own
// name always comes first — whether or not "Also sells" is switched on.
function logAsOptions(){
  return currentUser.role==='supervisor' ? [currentUser.name, ...REPS.filter(r=>r!==currentUser.name)] : [currentUser.name];
}
// Everyone who can be the second person on a joint visit: the sellers plus
// the supervisors (a joint visit with the supervisor is the common case).
function jointPeople(){
  const sups = staff.filter(s=>s.role==='supervisor').map(s=>s.name);
  return [...REPS, ...sups.filter(n=>!REPS.includes(n))];
}
function prepLogView(qClinicId){
  renderLogHistory();
  const asOpts = logAsOptions();
  logAsRep = asOpts.includes(logAsRep) ? logAsRep : (REPS.includes(currentUser.name) || !REPS.length ? currentUser.name : REPS[0]);
  const wrap = document.getElementById('logAsWrap');
  if(currentUser.role==='supervisor'){
    wrap.style.display = 'block';
    document.getElementById('logAsChips').innerHTML = asOpts.map(r=>`<div class="chip ${logAsRep===r?'on':''}" onclick="setLogAsRep('${esc(r)}')">${esc(r)}</div>`).join('');
  } else {
    wrap.style.display = 'none';
  }
  jointRep = null;
  renderJointChips();
  selectedClinicId = qClinicId || null;
  selectedDoctorIds = [];
  rxOn = false; rxDrafts.log = {}; // a new form starts at "No", nothing typed (drawn by renderClinicSelect below)
  newClinicMode = false;
  document.getElementById('clinicSearchLog').value='';
  document.getElementById('newClinicFields').style.display='none';
  document.getElementById('newClinicName').value='';
  document.getElementById('newClinicContact').value='';
  document.getElementById('newClinicPhone').value='';
  renderClinicSelect(qClinicId||null);

  document.getElementById('prodSearchLog').value='';
  selectedProducts = [];
  draftOrders = [];
  renderProductChips();

  noOrderReason = null;
  visitMood = null; renderMoodChips();
  visitPhotos = [];
  renderVisitPhotos();
  setOrder(false);
  document.getElementById('noOrderOther').value='';
  document.getElementById('visitNotes').value='';

  const qd = document.getElementById('quickDates');
  const opts = [{l:'+3 days', d:3},{l:'+1 week', d:7},{l:'+2 weeks', d:14},{l:'+1 month', d:30}];
  qd.innerHTML = opts.map(o=>`<button data-days="${o.d}" onclick="pickQuickDate(${o.d})">${o.l}</button>`).join('');
  document.getElementById('followUpDate').value='';
}
function setLogAsRep(r){
  logAsRep = r;
  if(jointRep===r) jointRep = null;
  renderClinicSelect();
  document.getElementById('logAsChips').querySelectorAll('.chip').forEach(c=>c.classList.toggle('on', c.textContent===r));
  renderJointChips();
}
// ---- JOINT (DOUBLE) VISITS ----
function renderJointChips(){
  const el = document.getElementById('jointChips');
  const wrap = document.getElementById('jointWrap');
  if(!el) return;
  const options = jointPeople().filter(r=>r!==logAsRep);
  if(wrap) wrap.style.display = options.length ? 'block' : 'none';
  el.innerHTML = `<div class="chip small ${!jointRep?'on':''}" onclick="setJointRep(null)">Solo</div>`
    + options.map(r=>`<div class="chip small ${jointRep===r?'on':''}" onclick="setJointRep('${esc(r)}')">🤝 ${esc(r)}</div>`).join('');
}
function setJointRep(r){ jointRep = r; renderJointChips(); }
function renderClinicSelect(qClinicId){
  if(qClinicId!==undefined && qClinicId!==null) selectedClinicId = qClinicId;
  const q = (document.getElementById('clinicSearchLog').value||'').toLowerCase().trim();
  const listEl = document.getElementById('clinicPickList');
  const cardEl = document.getElementById('selectedClinicCard');

  if(selectedClinicId){
    const c = clinics.find(x=>x.id===selectedClinicId);
    if(c){
      listEl.style.display='none';
      document.getElementById('newClinicBtn').style.display='none';
      cardEl.style.display='block';
      cardEl.innerHTML = `<div class="card" style="border-inline-start:4px solid ${clsColor(c.cls)};">
        <div class="row-between">
          <div style="display:flex; align-items:center; gap:11px;">
            <span class="cls cls-${c.cls}">${c.cls||'-'}</span>
            <div>
              <div class="clinic-name">${esc(c.name)}</div>
              <div class="clinic-sub">${esc(c.rep||'')}${c.account?' · '+esc(c.account):''}${c.isNew?' · 🆕 New customer':''}</div>
            </div>
          </div>
          <button class="chip small" onclick="clearClinicPick()">Change</button>
        </div>
        ${sellHintLine(c)}
      </div>`;
      renderDoctorPick(c);
      return;
    }
  }
  cardEl.style.display='none';
  listEl.style.display='block';
  document.getElementById('newClinicBtn').style.display='block';
  // Step 2 stays visible with a hint, so the numbered steps never skip 1 → 3.
  document.getElementById('doctorPickWrap').style.display='block';
  document.getElementById('doctorPickChips').innerHTML =
    `<div style="color:rgba(255,255,255,.5); font-size:12.5px; padding:2px 0 4px;">Pick the clinic in step 1 first — its doctors will appear here to tap.</div>`;
  document.getElementById('docTipLink').innerHTML = '';
  renderRxStep();

  const mine = clinics.filter(c=>c.rep===logAsRep && c.cls!=='Closed');
  const others = currentUser.role==='supervisor' ? clinics.filter(c=>c.rep!==logAsRep && c.cls!=='Closed') : [];
  const filt = c => c.name.toLowerCase().includes(q);
  let list = [...mine.filter(filt).sort((a,b)=>a.name.localeCompare(b.name)),
              ...others.filter(filt).sort((a,b)=>a.name.localeCompare(b.name))];
  if(!q) list = list.slice(0,8);
  if(list.length===0){
    listEl.innerHTML = `<div class="card" style="color:var(--muted); font-size:13.5px;">No clinic matches "${esc(q)}". Add it as a new customer below.</div>`;
    return;
  }
  listEl.innerHTML = list.map(c=>`
    <div class="card clickable" style="padding:12px 14px; border-inline-start:4px solid ${clsColor(c.cls)};" onclick="pickClinic('${c.id}')">
      <div class="row-between">
        <div style="display:flex; align-items:center; gap:11px;">
          <span class="cls cls-${c.cls}">${c.cls||'-'}</span>
          <div>
            <div class="clinic-name" style="font-size:14.5px;">${esc(c.name)}</div>
            <div class="clinic-sub">${(c.doctors||[]).length} doctor${(c.doctors||[]).length===1?'':'s'}${c.rep!==logAsRep?' · '+esc(c.rep):''}</div>
          </div>
        </div>
        <span style="color:var(--muted); font-size:19px;">›</span>
      </div>
    </div>`).join('') + (!q && (mine.length+others.length)>8 ? `<div style="text-align:center; color:var(--muted); font-size:12.5px; padding:6px;">Search to see all ${mine.length+others.length} clinics</div>` : '');
}
function clsColor(cls){
  return {A:'#34C759',B:'#57B85D',C:'#FF9500',D:'#C7C7CC',F:'#FF3B30'}[cls] || '#C7C7CC';
}
function pickClinic(id){
  selectedClinicId = id;
  newClinicMode = false;
  document.getElementById('newClinicFields').style.display='none';
  renderClinicSelect();
}
// The single strongest suggestion, shown while the visit is being logged.
function sellHintLine(c){
  const g = clinicSellGuide(c.id);
  const top = g.lapsed[0] || g.upsell[0] || g.cross[0];
  if(!top) return '';
  const tag = g.lapsed[0] ? 'Re-order' : g.upsell[0] ? 'Up-sell' : 'Cross-sell';
  return `<div style="margin-top:10px; padding-top:9px; border-top:1px dashed var(--line); font-size:12.5px; line-height:1.45;">
    <span style="font-weight:800; font-size:10px; letter-spacing:.06em; color:var(--muted); text-transform:uppercase;">${tag}</span>
    <div style="font-weight:700;">${esc(top.product)}</div>
    <div style="color:var(--muted); font-size:11.5px;">${esc(top.reason)}</div>
  </div>`;
}
function clearClinicPick(){
  selectedClinicId = null;
  selectedDoctorIds = [];
  rxClearDraft('log'); // the pads typed were for that clinic's people
  document.getElementById('clinicSearchLog').value='';
  renderClinicSelect();
}
function startNewClinic(){
  newClinicMode = true;
  selectedClinicId = null;
  document.getElementById('newClinicFields').style.display='block';
  document.getElementById('clinicPickList').style.display='none';
  document.getElementById('newClinicBtn').style.display='none';
  document.getElementById('newClinicClsChips').innerHTML = ['A','B','C','D','F'].map(c=>`<div class="chip small" data-cls="${c}" onclick="pickModalCls(this)">${c}</div>`).join('');
  document.getElementById('newClinicAcctChips').innerHTML = ACCOUNT_TYPES.map(a=>`<div class="chip small" data-acct="${a}" onclick="pickModalCls(this)">${a}</div>`).join('');
  renderRxStep(); // a new customer has no people on file yet: only "the clinic (no one person)"
}
function cancelNewClinic(){
  newClinicMode = false;
  rxClearDraft('log');
  document.getElementById('newClinicFields').style.display='none';
  renderClinicSelect();
}
function renderDoctorPick(c){
  const wrap = document.getElementById('doctorPickWrap');
  const chips = document.getElementById('doctorPickChips');
  const tip = document.getElementById('docTipLink');
  wrap.style.display='block';
  const docs = c.doctors||[];
  chips.innerHTML = docs.map(d=>{
    const pb = SPECIALTY_PLAYBOOK[d.title];
    return `<div class="chip small ${selectedDoctorIds.includes(d.id)?'on':''}" onclick="pickDoctorSeen('${d.id}')">${pb?pb.icon+' ':''}${esc(d.name)}</div>`;
  }).join('') + `<div class="chip small" onclick="openQuickAddDoctor('${c.id}')">+ Add doctor</div>`;
  const d = docs.find(x=>x.id===selectedDoctorIds[selectedDoctorIds.length-1]);
  if(d && d.title && SPECIALTY_PLAYBOOK[d.title]){
    const pb = SPECIALTY_PLAYBOOK[d.title];
    tip.innerHTML = `<div class="card clickable" style="margin-top:10px; background:${pb.color}14; border-inline-start:4px solid ${pb.color};" onclick="openPlaybook('${d.title}')">
      <div style="font-size:12px; font-weight:700; color:${pb.color}; text-transform:uppercase; letter-spacing:.05em;">${pb.icon} ${esc(d.title)}</div>
      <div style="font-size:13px; margin-top:5px; line-height:1.5;">${esc(pb.lead[0])}</div>
      <div style="font-size:12.5px; color:${pb.color}; font-weight:600; margin-top:6px;">Open full playbook ›</div>
    </div>`;
  } else { tip.innerHTML=''; }
  renderRxStep(); // one block per person met
}
function pickDoctorSeen(id){
  if(selectedDoctorIds.includes(id)){
    selectedDoctorIds = selectedDoctorIds.filter(x=>x!==id);
    rxDropPerson('log', id); // a person un-tapped takes the pads typed for them along (like a deselected product)
  }
  else selectedDoctorIds.push(id);
  const c = clinics.find(x=>x.id===selectedClinicId);
  if(c) renderDoctorPick(c);
}
function openQuickAddDoctor(clinicId){
  showModal(`
    <h3 style="margin-top:0;">Add doctor</h3>
    <input type="text" id="newDocName" dir="auto" placeholder="Doctor name">
    <label>Specialty</label>
    <div class="chip-row" id="newDocTitleChips">${SPECIALTIES.map(t=>`<div class="chip small" data-title="${t}" onclick="pickDocTitle(this)">${SPECIALTY_PLAYBOOK[t].icon} ${t}</div>`).join('')}</div>
    <button class="btn" onclick="quickAddDoctorSave('${clinicId}')">Save doctor</button>
  `);
}
async function quickAddDoctorSave(clinicId){
  // Adds the doctor and selects them as "who you met" — the reason the user
  // opened this sheet mid-logging. Stays open if validation failed.
  const r = await addDoctor(clinicId);
  if(r && r.ids.length){
    r.ids.forEach(id => { if(!selectedDoctorIds.includes(id)) selectedDoctorIds.push(id); }); // new AND already-listed ones
    closeModal();
    renderClinicSelect();
  }
}
function quickLogFrom(clinicId){ switchView('log'); prepLogView(clinicId); }
function onClinicPick(){}
function renderProductChips(){
  const q = (document.getElementById('prodSearchLog').value||'').toLowerCase();
  const chips = document.getElementById('productChips');
  const list = products.filter(p=>p.name.toLowerCase().includes(q) || (p.brand||'').toLowerCase().includes(q));
  if(!list.length){ chips.innerHTML = `<div style="color:var(--muted); font-size:13px; padding:6px 0;">No products match.</div>`; return; }
  const byBrand = {};
  list.forEach(p=>{ const b = p.brand||'Other'; (byBrand[b]=byBrand[b]||[]).push(p); });
  const brands = Object.keys(byBrand).sort((a,b)=>byBrand[b].length-byBrand[a].length || a.localeCompare(b));
  brands.forEach(b=>byBrand[b].sort((x,y)=>x.name.localeCompare(y.name)));
  chips.innerHTML = brands.map(b=>`
    <div class="chip-brand-group">
      <div class="chip-brand-label"><span class="swatch" style="background:${brandColor(b)}"></span>${esc(b)}</div>
      <div class="chip-row">
        ${byBrand[b].map(p=>`<div class="chip small withimg ${selectedProducts.includes(productKey(p))?'on':''}" data-id="${productKey(p)}" onclick="toggleProductChip('${productKey(p)}')">${prodThumb(p,'pthumb')}<span>${esc(p.name)}</span></div>`).join('')}
      </div>
    </div>`).join('');
}
function toggleProductChip(id){
  if(selectedProducts.includes(id)){
    selectedProducts = selectedProducts.filter(x=>x!==id);
    draftOrders.forEach(o=>{ if(o.qty) delete o.qty[id]; }); // a deselected product leaves the order too
  }
  else { selectedProducts.push(id); }
  renderProductChips();
  if(orderTaken) renderOrders();
}
function renderNoOrderChips(){
  document.getElementById('noOrderChips').innerHTML = NO_ORDER_REASONS.map(r=>`<div class="chip small ${noOrderReason===r?'on':''}" onclick="pickNoOrderReason('${r.replace(/'/g,"\\'")}')">${r}</div>`).join('');
}
function pickNoOrderReason(r){
  noOrderReason = (noOrderReason===r) ? null : r;
  renderNoOrderChips();
}
function setOrder(val){
  orderTaken = val;
  document.getElementById('orderYes').classList.toggle('on', val);
  document.getElementById('orderNo').classList.toggle('on', !val);
  document.getElementById('orderItemsWrap').style.display = val ? 'block' : 'none';
  document.getElementById('noOrderWrap').style.display = val ? 'none' : 'block';
  if(!val) renderNoOrderChips();
  if(val){
    if(draftOrders.length===0) draftOrders = [newDraftOrder()];
    renderOrders();
  }
}
function newDraftOrder(){
  const o = {id:uid(), qty:{}, discountPct:0, notes:''};
  selectedProducts.forEach(pid=>{ o.qty[pid]=1; });
  return o;
}
function addAnotherOrder(){
  draftOrders.push(newDraftOrder());
  renderOrders();
}
function removeDraftOrder(oid){
  draftOrders = draftOrders.filter(o=>o.id!==oid);
  if(draftOrders.length===0) draftOrders = [newDraftOrder()];
  renderOrders();
}
function orderGross(o){ return UMCore.orderGross(o, products); }
function orderNet(o){ return UMCore.orderNet(o, products); }
function renderOrders(){
  const wrap = document.getElementById('ordersContainer');
  if(selectedProducts.length===0){
    wrap.innerHTML = `<div class="card" style="color:var(--muted); font-size:13px;">Select products above first, then set quantities and discount here.</div>`;
    updateOrderTotalDisplay();
    return;
  }
  wrap.innerHTML = draftOrders.map((o,idx)=>{
    const gross = orderGross(o);
    const net = orderNet(o); // the same rounded figure the saved order carries
    const disc = Math.round((gross-net)*100)/100;
    return `<div class="card">
      <div class="row-between" style="margin-bottom:8px;">
        <strong style="font-size:14px;">Order ${idx+1}</strong>
        ${draftOrders.length>1?`<button class="del" onclick="removeDraftOrder('${o.id}')">&times;</button>`:''}
      </div>
      ${(()=>{
        const opsByBrand = {};
        selectedProducts.forEach(pid=>{
          const p = findProduct(pid);
          if(!p) return;
          const b = p.brand||'Other';
          (opsByBrand[b]=opsByBrand[b]||[]).push(p);
        });
        const obBrands = Object.keys(opsByBrand).sort((a,b)=>opsByBrand[b].length-opsByBrand[a].length || a.localeCompare(b));
        obBrands.forEach(b=>opsByBrand[b].sort((x,y)=>x.name.localeCompare(y.name)));
        return obBrands.map(b=>`
          <div class="chip-brand-label" style="margin-top:10px;"><span class="swatch" style="background:${brandColor(b)}"></span>${esc(b)}</div>
          ${opsByBrand[b].map(p=>{
            const key = productKey(p);
            const q = o.qty[key]||0;
            return `<div class="qty-row">
              ${prodThumb(p,'pthumb')}
              <div class="pname">${esc(p.name)}<br><span style="color:var(--muted); font-size:12px;">${p.price!=null?p.price.toFixed(2)+' KD each':'no price'}</span></div>
              <div class="stepper">
                <button type="button" onclick="bumpQty('${o.id}','${key}',-1)" ${q<=0?'disabled':''} aria-label="less">−</button>
                <input class="val" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="9999" step="1" value="${q}" id="q-${o.id}-${slugify(key)}" aria-label="quantity"
                  onfocus="this.select()" oninput="setQtyLive('${o.id}','${key}',this.value)" onchange="setQty('${o.id}','${key}',this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">
                <button type="button" onclick="bumpQty('${o.id}','${key}',1)" aria-label="more">+</button>
              </div>
            </div>`;
          }).join('')}`).join('');
      })()}
      <div style="padding:12px 0 4px; border-top:1px solid var(--line);">
        <div style="font-size:14px; font-weight:600; margin-bottom:2px;">Discount</div>
        <div class="disc-chips">
          ${DISCOUNT_PRESETS.map(d=>`<div class="chip ${(o.discountPct||0)===d?'on':''}" data-pct="${d}" onclick="setDraftDiscount('${o.id}',${d})">${d===0?'None':d+'%'}</div>`).join('')}
          <input class="disc-other ${DISCOUNT_PRESETS.includes(o.discountPct||0)?'':'on'}" type="number" inputmode="decimal" min="0" max="100" step="0.5" placeholder="Other %" aria-label="other discount percent"
            value="${DISCOUNT_PRESETS.includes(o.discountPct||0)?'':o.discountPct}" onchange="setDraftDiscountTyped('${o.id}',this)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">
        </div>
      </div>
      <div style="font-size:13px; color:var(--muted); padding-top:10px;">
        <div class="row-between"><span>Subtotal</span><span>${money(gross)}</span></div>
        <div class="row-between"><span>Discount (${o.discountPct||0}%)</span><span style="color:var(--coral-ink);">− ${money(disc)}</span></div>
        <div class="row-between" style="color:var(--ink); font-weight:700; margin-top:4px;"><span>Net</span><span>${money(net)}</span></div>
      </div>
      <input type="text" placeholder="Order notes (optional)" dir="auto" value="${esc(o.notes)}" oninput="setDraftNotes('${o.id}',this.value)" style="margin-top:10px;">
    </div>`;
  }).join('');
  updateOrderTotalDisplay();
}
// Discount presets offered as one-tap chips (any other percentage can be typed).
const DISCOUNT_PRESETS = [0,5,10,15,20,25,30,40];
function bumpQty(oid,pid,delta){
  const o = draftOrders.find(x=>x.id===oid); if(!o) return;
  o.qty[pid] = Math.max(0, (o.qty[pid]||0) + delta);
  renderOrders();
}
// A quantity typed straight into the box: whole units, never negative, capped
// so a stray keypress cannot turn 12 into 12000 unnoticed.
function cleanQty(val){
  let n = Number(String(val).trim());
  if(!isFinite(n)) n = Number(String(val).replace(/[^\d.]/g, '')); // "12 pcs" → 12
  n = Math.floor(n);
  if(!isFinite(n) || n < 0) return 0; // a minus sign is never a quantity
  return Math.min(9999, n);
}
// While typing: keep the field focused, refresh the money lines only.
function setQtyLive(oid,pid,val){
  const o = draftOrders.find(x=>x.id===oid); if(!o) return;
  if(String(val).trim()==='') return; // mid-edit (cleared to retype) — wait for the final value
  o.qty[pid] = cleanQty(val);
  refreshOrderTotalsOnly();
  updateOrderTotalDisplay();
}
// On leaving the field: settle the value IN PLACE. Rebuilding the card here
// would swallow the tap that caused the blur (the +, a chip, the next box).
function setQty(oid,pid,val){
  const o = draftOrders.find(x=>x.id===oid); if(!o) return;
  const q = o.qty[pid] = cleanQty(val);
  const el = document.getElementById('q-'+oid+'-'+slugify(pid));
  if(el){
    if(el.value !== String(q)) el.value = q;
    const minus = el.previousElementSibling; if(minus && minus.tagName==='BUTTON') minus.disabled = q<=0;
  }
  refreshOrderTotalsOnly();
}
// The typed "Other %" box: apply in place (chips unlit, box lit) — same reason.
function setDraftDiscountTyped(oid, inputEl){
  const o = draftOrders.find(x=>x.id===oid); if(!o) return;
  const raw = String(inputEl.value).trim();
  o.discountPct = raw==='' ? 0 : Math.min(100, Math.max(0, parseFloat(raw)||0)); // an emptied box is "no discount" — never a hidden one
  inputEl.value = o.discountPct;
  const preset = DISCOUNT_PRESETS.includes(o.discountPct);
  inputEl.classList.toggle('on', !preset);
  if(preset) inputEl.value = '';
  inputEl.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on', preset && Number(c.dataset.pct)===o.discountPct));
  refreshOrderTotalsOnly();
}
function setDraftDiscount(oid,val){
  const o = draftOrders.find(x=>x.id===oid); if(!o) return;
  o.discountPct = Math.min(100, Math.max(0, parseFloat(val)||0));
  renderOrders();
}
function setDraftNotes(oid,val){
  const o = draftOrders.find(x=>x.id===oid); if(!o) return;
  o.notes = val;
}
function refreshOrderTotalsOnly(){
  draftOrders.forEach((o,idx)=>{
    const card = document.getElementById('ordersContainer').children[idx];
    if(!card) return;
    const gross = orderGross(o), net = orderNet(o), disc = Math.round((gross-net)*100)/100;
    const box = card.querySelector('div[style*="font-size:13px"]');
    if(box){
      box.innerHTML = `<div class="row-between"><span>Subtotal</span><span>${money(gross)}</span></div>
        <div class="row-between"><span>Discount (${o.discountPct||0}%)</span><span style="color:var(--coral-ink);">− ${money(disc)}</span></div>
        <div class="row-between" style="color:var(--ink); font-weight:700; margin-top:4px;"><span>Net</span><span>${money(net)}</span></div>`;
    }
  });
  updateOrderTotalDisplay();
}
function updateOrderTotalDisplay(){
  const total = draftOrders.reduce((s,o)=>s+orderNet(o),0);
  document.getElementById('orderTotalDisplay').textContent = money(total);
}
function pickQuickDate(days){
  document.querySelectorAll('#quickDates button').forEach(b=>b.classList.toggle('on', parseInt(b.dataset.days)===days));
  const d = new Date(); d.setDate(d.getDate()+days);
  document.getElementById('followUpDate').value = localDateStr(d);
}

async function saveVisit(){
  // Double-tap guard: repeated saves within a few seconds created duplicate
  // visit rows in the field (verified against real exported data).
  const now = Date.now();
  if(window._lastVisitSaveAt && now - window._lastVisitSaveAt < 4000){ showToast('Already saving…'); return; }
  window._lastVisitSaveAt = now;
  let clinicId = selectedClinicId;
  // A rep files visits under their own name only — "logging as" is a
  // supervisor control, enforced here too so no stale screen can bypass it.
  // Marking a colleague as joint stays open to everyone: both were there.
  const rep = currentUser.role === 'supervisor' ? logAsRep : currentUser.name;
  const joint = jointRep;
  if(currentUser.role === 'supervisor' && !logAsOptions().includes(rep)){ window._lastVisitSaveAt = 0; showToast('Choose which rep you are logging for'); return; }
  if(newClinicMode){
    const name = document.getElementById('newClinicName').value.trim();
    if(!name){ window._lastVisitSaveAt = 0; showToast('Enter a clinic name'); return; }
    const dup = clinics.find(c=>c.name.toLowerCase()===name.toLowerCase());
    if(dup){ window._lastVisitSaveAt = 0; showToast('A clinic with this name already exists'); return; }
    const clsEl = document.querySelector('#newClinicClsChips .chip.on');
    const acctEl = document.querySelector('#newClinicAcctChips .chip.on');
    clinicId = uid();
    clinics.push(normalizeClinic({id:clinicId, name, rep,
      cls: clsEl?clsEl.dataset.cls:null, market:null, notes:'',
      account: acctEl?acctEl.dataset.acct:null, isNew:true, addedOn:todayStr(),
      contact: document.getElementById('newClinicContact').value.trim(),
      phone: document.getElementById('newClinicPhone').value.trim()}));
  }
  if(!clinicId){ window._lastVisitSaveAt = 0; showToast('Pick a clinic first'); return; }
  // Who did you meet is required: a visit without the doctor's name can't be
  // followed up or verified. New inline-created clinics are exempt (no roster
  // yet) — the picker offers "+ Add doctor" for everyone else.
  if(!newClinicMode && selectedDoctorIds.length === 0){
    window._lastVisitSaveAt = 0;
    const cRef = clinics.find(x=>x.id===clinicId);
    showToast((cRef && (cRef.doctors||[]).length) ? '👨‍⚕️ Pick who you met — required' : '👨‍⚕️ Add the doctor you met first (+ Add doctor)');
    return;
  }
  const followUp = document.getElementById('followUpDate').value || null;
  let savedOrders = [], orderTotal = 0, grossTotal = 0, discountTotal = 0;
  if(orderTaken){
    draftOrders.forEach(o=>{
      const items = [];
      Object.keys(o.qty).forEach(pid=>{
        const q = o.qty[pid]||0;
        if(q>0 && selectedProducts.includes(pid)) items.push({productId:pid, qty:q});
      });
      if(items.length===0) return;
      const oq = {...o, qty: Object.fromEntries(items.map(it=>[it.productId, it.qty]))}; // only what is being saved
      const gross = orderGross(oq);
      const net = orderNet(oq);
      savedOrders.push({id:o.id, items, discountPct:o.discountPct||0, gross:Math.round(gross*100)/100, discountAmount:Math.round((gross-net)*100)/100, total:net, notes:o.notes||''});
      grossTotal += gross; discountTotal += (gross-net); orderTotal += net;
    });
  }
  const allItems = savedOrders.flatMap(o=>o.items);
  const visit = {id:uid(), clinicId, rep, withRep: (joint && joint!==rep) ? joint : null, date:todayStr(), ts:Date.now(), products: selectedProducts.slice(), orderTaken: savedOrders.length>0, orders: savedOrders, orderItems: allItems, orderGross: Math.round(grossTotal*100)/100, orderDiscount: Math.round(discountTotal*100)/100, orderTotal: Math.round(orderTotal*100)/100, doctorId: selectedDoctorIds[0]||null, doctorIds: selectedDoctorIds.slice(), nextFollowUp: followUp, notes: document.getElementById('visitNotes').value.trim(),
    noOrderReason: (savedOrders.length===0) ? (noOrderReason || document.getElementById('noOrderOther').value.trim() || null) : null};
  if(visitMood) visit.mood = visitMood;                // the doctor's satisfaction, as the rep read it (optional)
  if(visitPhotos.length){
    const ids=[];
    for(const ph of visitPhotos){ if(await savePhotoBlob(ph.id, ph.full)) ids.push({id:ph.id, thumb:ph.thumb}); }
    visit.photos = ids;
  }
  // Prescription pads given: only what was typed for the people met (or the
  // clinic), whole pads, known types — cleaned by the one save path. "Yes"
  // with every count at 0 stores nothing, like an order with no items. An
  // old cached core.js (no helpers) saves the visit without them.
  if(rxOn && rxReady()){
    const rx = UMCore.cleanVisitRx(rxDraftLines('log'), { types: rxTypes(), doctorIds: visit.doctorIds });
    if(rx.length) visit.rx = rx;
  }
  const clinic = clinics.find(c=>c.id===clinicId);
  visits.push(visit);
  if(clinic){ clinic.lastVisit = todayStr(); clinic.nextFollowUp = followUp; }

  // This save's own outcome, read the moment its visits write settles: the
  // offline queue may send visits again while the follow-up step runs, and
  // that later save is not this one (persistFor / sentSince, 04).
  const [vs] = await Promise.all([persistFor('visits'), persist('clinics')]);
  if(clinic) await scheduleFollowUp(clinic, followUp, rep);
  if(navigator.vibrate) navigator.vibrate(12); // a small physical "saved" cue in the field
  const outcome = vs.outcome;
  if(vs.ok || sentSince('visits', vs)) showToast(visitSavedMsg()); // queued here, sent by the queue meanwhile = saved
  else if(outcome.queued && outcome.mirrored) showToast('📴 الزيارة محفوظة على هذا الجهاز — سترفع تلقائيًا عند عودة الاتصال');
  else showToast('⚠️ لم تُحفظ الزيارة على السحابة ولا على الجهاز (الذاكرة ممتلئة) — أبقِ التطبيق مفتوحًا حتى يعود الاتصال');
  renderAll();
  switchView('today');
}

// ---- FOLLOW-UP AUTOMATION: auto-task + auto-schedule ----
const AUTO_FOLLOWUP_NOTE = '📅 Follow-up due';
async function scheduleFollowUp(clinic, dateStr, rep){
  // Clear out any previous auto-scheduled entry for this clinic (only ones we
  // created — manually-planned entries for the same clinic are left alone).
  Object.keys(dayPlans).forEach(d=>{
    const dayObj = dayPlans[d];
    if(dayObj && dayObj[rep]){
      dayObj[rep] = dayObj[rep].filter(e => !(planEntryId(e)===clinic.id && planEntryNote(e)===AUTO_FOLLOWUP_NOTE));
    }
  });
  tasks.forEach(t => { if(t.kind==='followup' && t.clinicId===clinic.id && t.rep===rep && !t.done) tomb('tasks', t.id); });
  tasks = tasks.filter(t => !(t.kind==='followup' && t.clinicId===clinic.id && t.rep===rep && !t.done));
  if(dateStr){
    dayPlans[dateStr] = dayPlans[dateStr] || {};
    dayPlans[dateStr][rep] = dayPlans[dateStr][rep] || [];
    const already = dayPlans[dateStr][rep].some(e=>planEntryId(e)===clinic.id);
    if(!already) dayPlans[dateStr][rep].push({id: clinic.id, note: AUTO_FOLLOWUP_NOTE});
    tasks.push({id:uid(), text:'Follow up: '+clinic.name, done:false, created:todayStr(), rep, dueDate:dateStr, clinicId:clinic.id, kind:'followup'});
  }
  await Promise.all([persist('tasks'), persist('dayPlans')]);
}
function confirmFollowUp(clinicId){
  const c = clinics.find(x=>x.id===clinicId);
  if(!c) return;
  showModal(`
    <h3 style="margin-top:0;">${esc(c.name)}</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">${statusLabel(c.nextFollowUp)}. What's the next step?</p>
    <button class="btn" onclick="closeModal(); quickLogFrom('${c.id}')">${I('check')} Log the visit now</button>
    <button class="btn secondary" onclick="openRescheduleFollowUp('${c.id}')">${I('calendar')} Not yet — reschedule</button>
    <button class="btn ghost" onclick="clearFollowUp('${c.id}')">Clear — no longer needed</button>
  `);
}
function openRescheduleFollowUp(clinicId){
  const c = clinics.find(x=>x.id===clinicId);
  if(!c) return;
  showModal(`
    <h3 style="margin-top:0;">Reschedule follow-up</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">${esc(c.name)}</p>
    <div class="quickdate" id="rfQuickDates">
      ${[{l:'+3 days',d:3},{l:'+1 week',d:7},{l:'+2 weeks',d:14},{l:'+1 month',d:30}].map(o=>`<button data-days="${o.d}" onclick="pickRescheduleDate(${o.d})">${o.l}</button>`).join('')}
    </div>
    <input type="date" id="rfDate">
    <button class="btn" onclick="saveReschedule('${clinicId}')">Save new date</button>
  `);
}
function pickRescheduleDate(days){
  document.querySelectorAll('#rfQuickDates button').forEach(b=>b.classList.toggle('on', parseInt(b.dataset.days)===days));
  const d = new Date(); d.setDate(d.getDate()+days);
  document.getElementById('rfDate').value = localDateStr(d);
}
async function saveReschedule(clinicId){
  const c = clinics.find(x=>x.id===clinicId);
  if(!c) return;
  const val = document.getElementById('rfDate').value;
  if(!val){ showToast('Pick a date'); return; }
  c.nextFollowUp = val;
  await persist('clinics');
  await scheduleFollowUp(c, val, c.rep);
  closeModal();
  showToast('Follow-up rescheduled');
  renderAll();
}
async function clearFollowUp(clinicId){
  const c = clinics.find(x=>x.id===clinicId);
  if(!c) return;
  c.nextFollowUp = null;
  await persist('clinics');
  await scheduleFollowUp(c, null, c.rep);
  closeModal();
  showToast('Follow-up cleared');
  renderAll();
}

// The doctor's satisfaction on this visit, as the rep read it: optional, one
// tap. Feeds "doctor satisfaction" in the weekly management deck.
const VISIT_MOODS = [['pleased', '😊 Pleased'], ['neutral', '😐 Neutral'], ['concerned', '😟 Concerned']];
let visitMood = null;
function renderMoodChips(){
  const el = document.getElementById('moodChips'); if(!el) return;
  el.innerHTML = VISIT_MOODS.map(([k, l]) => `<div class="chip small ${visitMood === k ? 'on' : ''}" onclick="pickMood('${k}')">${l}</div>`).join('');
}
function pickMood(k){ visitMood = visitMood === k ? null : k; renderMoodChips(); }

// ---- PRESCRIPTIONS GIVEN (v114) ----
// The printed prescription forms left on a field visit, counted in PADS — the
// owner's unit (sheets per pad are not known, so nothing is ever converted).
// Step 4 of the form, "Prescriptions given?": No by default; on Yes one block
// per person met — or "the clinic (no one person)" for forms left at reception
// and for a new customer — and one row per active type, each with a stepper.
// Stored on the visit as v.rx = [{type, name, qty, doctorId|null}] by
// UMCore.cleanVisitRx; every screen reads it back through UMCore.visitRxLines
// and every figure is counted from UMCore.rxLedger: one path each, so the same
// pads are never counted twice. Calls and phone orders have no such step.
let rxOn = false;
// What is typed, per scope ('log' = the visit form, 'edit' = the edit sheet):
// { personKey: { typeId: pads } }. personKey '' = the clinic (no one person);
// its presence means its block is shown. Edited in place, so the 20-second
// refresh (which redraws only the history on this tab) never loses it.
const rxDrafts = { log: {}, edit: {} };
// the edit sheet: { visitId, clinicId, names: {typeId: the name saved on the visit},
//   held: the people who already had pads on the visit when the sheet opened, in line order }
let _rxEdit = null;
const RX_STALE_MSG = 'Reopen the app to finish updating — prescriptions can be logged after that.';
// An old cached core.js (the v102 lesson) has none of the helpers: the step
// then says so and the visit still saves, without prescriptions.
function rxReady(){
  return typeof UMCore === 'object' && UMCore !== null &&
    ['visitRxLines', 'cleanVisitRx', 'rxTypeList', 'rxLedger'].every(f => typeof UMCore[f] === 'function');
}
// The supervisor's types (the owner's two printed forms until he saves his own).
function rxTypes(){ return rxReady() ? UMCore.rxTypeList(rxTypesDoc) : []; }
function rxActiveTypes(){ return rxTypes().filter(t => t.active); }
// A type's name on screen: its current name by id, else the name saved on the
// line. Type names are the printed forms' own names — data, always shown in a
// dir="auto" span so they are never translated (a type called "Other" must not
// turn into أخرى), the two built-in forms included.
function rxTypeNameOf(id, snapshot){
  if(rxReady() && typeof UMCore.rxTypeName === 'function') return UMCore.rxTypeName(id, rxTypes(), snapshot);
  return String(snapshot || 'Prescription');
}
function rxPadsText(n){ return n + (n === 1 ? ' pad' : ' pads'); }
const _rxHas = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Who got the pads: a doctor (data), the clinic, or a doctor no longer on the
// clinic's list — never dropped silently.
function rxWhoHTML(key, clinic){
  if(key === '' || key == null) return '<span>The clinic (no one person)</span>';
  const d = ((clinic && clinic.doctors) || []).find(x => x && x.id === key);
  return d ? `<span dir="auto">${esc(d.name)}</span>` : '<span>A doctor no longer listed</span>';
}
function rxClinic(scope){
  const id = scope === 'edit' ? (_rxEdit && _rxEdit.clinicId) : selectedClinicId;
  return id ? clinics.find(c => c.id === id) || null : null;
}
// The people who can be given pads in this scope, in the order met, then the
// clinic when its block was added (or, for a new customer, only the clinic).
// The edit sheet also keeps anyone who already had pads on the visit without
// being marked as met (rxEditUnmet). null = no clinic picked yet.
function rxRecipients(scope){
  const draft = rxDrafts[scope] || {};
  let keys;
  if(scope === 'edit') keys = [...new Set((window._editDocIds || []).filter(id => id != null && id !== '').map(String))].concat(rxEditUnmet());
  else if(newClinicMode) return [''];
  else if(!selectedClinicId || !clinics.some(c => c.id === selectedClinicId)) return null;
  else keys = [...new Set(selectedDoctorIds.map(String))];
  if(_rxHas(draft, '')) keys.push('');
  return keys;
}
function rxPrune(scope, recips){
  const draft = rxDrafts[scope], keep = new Set(recips || []);
  Object.keys(draft).forEach(k => { if(!keep.has(k)) delete draft[k]; });
}
function rxDraftTotal(scope, keys){
  const draft = rxDrafts[scope] || {};
  let n = 0;
  (keys || Object.keys(draft)).forEach(k => { const b = draft[k]; if(b) Object.keys(b).forEach(t => { n += Number(b[t]) || 0; }); });
  return n;
}
// The clinic changed (or the new-customer form was cancelled): the pads typed
// were for the previous clinic's people — dropped, and said so.
function rxClearDraft(scope){
  const had = rxDraftTotal(scope) > 0;
  rxDrafts[scope] = {};
  if(had) showToast('Pads typed for the previous clinic were cleared');
}
// A person un-tapped takes the pads typed for them along, like a deselected
// product leaves the order — and says so.
function rxDropPerson(scope, id){
  const draft = rxDrafts[scope];
  if(!draft || !_rxHas(draft, id)) return;
  const had = Object.keys(draft[id] || {}).some(t => (Number(draft[id][t]) || 0) > 0);
  delete draft[id];
  if(had) showToast('Pads typed for that person were cleared');
}
function setRx(on){ rxOn = !!on; renderRxStep(); }
function rxNoteHTML(id, text, light){
  return `<div id="${id}" class="card" style="padding:9px 12px; margin-bottom:8px; font-size:12.5px; line-height:1.45; background:var(--amber-dim); color:var(--amber-ink);${light ? '' : ' box-shadow:none;'}">${text}</div>`;
}
// The visit form's step: Yes/No, then the blocks (or what to do first).
function renderRxStep(){
  const box = document.getElementById('rxBlocks');
  if(!box) return;
  const yes = document.getElementById('rxYes'), no = document.getElementById('rxNo');
  if(yes) yes.classList.toggle('on', rxOn);
  if(no) no.classList.toggle('on', !rxOn);
  const recips = rxRecipients('log');
  rxPrune('log', recips);
  box.style.display = rxOn ? 'block' : 'none';
  if(!rxOn){ box.innerHTML = ''; return; }
  const hint = t => `<div class="rx-hint" style="color:rgba(255,255,255,.6); font-size:12.5px; padding:2px 0 8px;">${t}</div>`;
  if(!rxReady()){ box.innerHTML = rxNoteHTML('rxStaleNote', RX_STALE_MSG); return; }
  if(recips === null){ box.innerHTML = hint('Pick the clinic in step 1 first.'); return; }
  let html = '';
  if(_rxTypesRead === 'failed' && !rxTypesDoc) html += rxNoteHTML('rxTypesNote', 'Prescription types did not load — only the two built-in forms are shown. Reopen the app when you are online.');
  if(!rxActiveTypes().length) html += rxNoteHTML('rxNoActiveNote', 'No prescription type is active — ask the supervisor to add one.');
  if(!recips.length) html += hint('Tap who you met in step 2 first — each person gets their own count.');
  html += rxBlocksHTML('log', recips, rxClinic('log'));
  const foot = [];
  if(!newClinicMode && !recips.includes('')) foot.push(`<button type="button" class="chip small" id="rxAddClinic-log" onclick="rxAddClinic('log')">+ Left at the clinic (no one person)</button>`);
  if(currentUser && currentUser.role === 'supervisor') foot.push(`<button type="button" class="chip small" id="rxEditTypes" onclick="openRxTypes()">${I('pencil')} Edit types</button>`);
  if(foot.length) html += `<div class="chip-row" style="margin:2px 0 4px;">${foot.join('')}</div>`;
  html += `<div id="rxTotal-log" style="color:#fff; font-size:13px; text-align:end; margin:4px 2px 2px;">${rxTotalHTML('log')}</div>`;
  box.innerHTML = html;
}
// One block per recipient, shared by the form and the edit sheet: a row per
// active type, plus any type this person already has pads of (a retired one
// marked so, one this phone does not know under the name saved on the visit).
function rxBlocksHTML(scope, recips, clinic){
  const list = rxTypes(), byId = {};
  list.forEach(t => { byId[t.id] = t; });
  const active = list.filter(t => t.active).map(t => t.id);
  const draft = rxDrafts[scope] || {};
  // the edit sheet: a doctor on the clinic's list who has pads on the visit but
  // is not marked as met says so ("A doctor no longer listed" says enough)
  const listed = new Set(((clinic && clinic.doctors) || []).filter(d => d && d.id != null).map(d => String(d.id)));
  const unmet = new Set(scope === 'edit' ? rxEditUnmet().filter(id => listed.has(id)) : []);
  return (recips || []).map(key => {
    const b = draft[key] || {};
    const ids = active.slice();
    Object.keys(b).forEach(id => { if(!ids.includes(id) && ((Number(b[id]) || 0) > 0 || !byId[id] || !byId[id].active)) ids.push(id); });
    return `<div class="card rx-doc" data-rx-scope="${scope}" data-rx-doc="${esc(key)}" style="padding:6px 12px 4px; margin-bottom:8px;">
      <div class="rx-who" style="font-weight:700; font-size:13.5px; padding:4px 0 2px; overflow-wrap:anywhere;">${rxWhoHTML(key, clinic)}${unmet.has(key) ? ' <span class="rx-unmet" style="color:var(--muted); font-weight:500; font-size:11.5px; white-space:nowrap;">(not marked as met)</span>' : ''}</div>
      ${ids.map(id => rxRowHTML(scope, key, id, byId[id], Number(b[id]) || 0)).join('')}
    </div>`;
  }).join('');
}
function rxRowHTML(scope, key, id, t, q){
  const name = t ? t.name : rxTypeNameOf(id, scope === 'edit' && _rxEdit ? _rxEdit.names[id] : '');
  return `<div class="qty-row" data-rx-type="${esc(id)}">
      <div class="pname" style="min-width:0; overflow-wrap:anywhere;"><span dir="auto">${esc(name)}</span>${t && !t.active ? ' <span style="color:var(--muted); font-size:11.5px; white-space:nowrap;">(retired)</span>' : ''}</div>
      <div class="stepper" style="flex-shrink:0;">
        <button type="button" class="rx-minus" onclick="rxBumpEl(this,-1)" ${q <= 0 ? 'disabled' : ''} aria-label="less">−</button>
        <input class="val rx-qty" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="999" step="1" value="${q}" id="${esc('rxq-' + scope + '-' + (key || '_') + '-' + id)}" aria-label="pads"
          onfocus="this.select()" oninput="rxSetLiveEl(this)" onchange="rxSettleEl(this)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">
        <button type="button" class="rx-plus" onclick="rxBumpEl(this,1)" aria-label="more">+</button>
      </div>
    </div>`;
}
// The box, its minus button and the total are updated IN PLACE — rebuilding
// the block here would swallow the tap that follows (the +, the next box).
function rxCtx(el){
  const row = el && el.closest ? el.closest('[data-rx-type]') : null, blk = row ? row.closest('[data-rx-doc]') : null;
  return row && blk ? { scope: blk.dataset.rxScope, key: blk.dataset.rxDoc, type: row.dataset.rxType, row } : null;
}
function rxGet(scope, key, type){ const b = rxDrafts[scope] && rxDrafts[scope][key]; return b ? (Number(b[type]) || 0) : 0; }
function rxPut(scope, key, type, q){
  const draft = rxDrafts[scope]; if(!draft) return;
  (draft[key] || (draft[key] = {}))[type] = q;
}
function rxRefresh(scope, row, q, rewrite){
  const input = row && row.querySelector('input.rx-qty'), minus = row && row.querySelector('button.rx-minus');
  if(rewrite && input && input.value !== String(q)) input.value = q;
  if(minus) minus.disabled = q <= 0;
  const tot = document.getElementById('rxTotal-' + scope);
  if(tot) tot.innerHTML = rxTotalHTML(scope);
}
function rxBump(scope, key, type, d, row){
  const q = UMCore.rxQty(rxGet(scope, key, type) + d);
  rxPut(scope, key, type, q);
  rxRefresh(scope, row, q, true);
}
function rxBumpEl(el, d){ const x = rxCtx(el); if(x) rxBump(x.scope, x.key, x.type, d, x.row); }
// While typing: keep the box as typed (focus, caret), follow the total only.
function rxSetLive(scope, key, type, val, row){
  if(String(val).trim() === '') return; // cleared to retype — wait for the final value
  const q = UMCore.rxQty(val);
  rxPut(scope, key, type, q);
  rxRefresh(scope, row, q, false);
}
function rxSetLiveEl(el){ const x = rxCtx(el); if(x) rxSetLive(x.scope, x.key, x.type, el.value, x.row); }
// On leaving the box: whole pads, never negative, at most 999 — shown as kept.
function rxSettle(scope, key, type, el, row){
  const q = UMCore.rxQty(el.value);
  rxPut(scope, key, type, q);
  rxRefresh(scope, row, q, true);
}
function rxSettleEl(el){ const x = rxCtx(el); if(x) rxSettle(x.scope, x.key, x.type, el, x.row); }
function rxTotalHTML(scope){
  const n = rxDraftTotal(scope, rxRecipients(scope) || []);
  return n > 0 ? `<span>Total</span> <b>${rxPadsText(n)}</b>` : '';
}
function rxAddClinic(scope){
  if(!_rxHas(rxDrafts[scope], '')) rxDrafts[scope][''] = {};
  if(scope === 'edit') renderRxEdit(); else renderRxStep();
}
// What was typed, as lines for UMCore.cleanVisitRx: current recipients only.
function rxDraftLines(scope){
  const draft = rxDrafts[scope] || {}, out = [];
  (rxRecipients(scope) || []).forEach(k => {
    const b = draft[k]; if(!b) return;
    Object.keys(b).forEach(t => { const q = Number(b[t]) || 0; if(q > 0) out.push({ type: t, qty: q, doctorId: k || null }); });
  });
  return out;
}
// ---- the edit sheet (08: openEditVisit / toggleEditDoc / saveEditVisit) ----
// Every person who has pads on the visit gets a block, also someone no longer
// marked as met (a phone on an older version un-tapped them, or a doctor record
// was merged or removed): shown "(not marked as met)" — or "A doctor no longer
// listed" — and kept on save. Their pads go only through the explicit drop
// (tap them as met, then un-tap: rxDropPerson, with its toast) or by setting
// the counts to 0 — never silently because the sheet did not show them.
function rxEditInit(v){
  _rxEdit = { visitId: v.id, clinicId: v.clinicId, names: {}, held: [] };
  rxDrafts.edit = {};
  if(rxReady()) UMCore.visitRxLines(v).forEach(l => {
    const k = l.doctorId == null ? '' : String(l.doctorId);
    const b = rxDrafts.edit[k] || (rxDrafts.edit[k] = {});
    b[l.type] = UMCore.rxQty((Number(b[l.type]) || 0) + l.qty);
    if(!_rxEdit.names[l.type] && l.name) _rxEdit.names[l.type] = l.name;
    if(k !== '' && !_rxEdit.held.includes(k)) _rxEdit.held.push(k);
  });
  renderRxEdit();
}
// People with pads on the visit who are not (or no longer) marked as met in
// the sheet, and whose pads were not dropped: their blocks stay.
function rxEditUnmet(){
  const met = new Set((window._editDocIds || []).filter(id => id != null).map(String)), draft = rxDrafts.edit || {};
  return ((_rxEdit && _rxEdit.held) || []).filter(id => !met.has(id) && _rxHas(draft, id));
}
// Whose lines an edit may keep (UMCore.cleanVisitRx doctorIds): the people met
// and everyone who already had pads on the visit.
function rxEditPeople(){
  const out = [...new Set((window._editDocIds || []).filter(id => id != null && id !== '').map(String))];
  ((_rxEdit && _rxEdit.held) || []).forEach(id => { if(!out.includes(id)) out.push(id); });
  return out;
}
function renderRxEdit(){
  const el = document.getElementById('evRx');
  if(!el) return;
  if(!rxReady()){ el.innerHTML = rxNoteHTML('rxStaleNote', RX_STALE_MSG, true); return; }
  const recips = rxRecipients('edit'); // the people met + anyone who still has pads on the visit
  rxPrune('edit', recips);
  let html = '';
  if(!rxActiveTypes().length) html += rxNoteHTML('rxNoActiveNote', 'No prescription type is active — ask the supervisor to add one.', true);
  if(!recips.length) html += `<div style="color:var(--muted); font-size:12.5px; padding:2px 0 6px;">Tap who you met above first — each person gets their own count.</div>`;
  html += rxBlocksHTML('edit', recips, rxClinic('edit'));
  if(!recips.includes('')) html += `<button type="button" class="chip small" id="rxAddClinic-edit" onclick="rxAddClinic('edit')">+ Left at the clinic (no one person)</button>`;
  html += `<div id="rxTotal-edit" style="font-size:13px; text-align:end; margin:4px 2px 2px;">${rxTotalHTML('edit')}</div>`;
  el.innerHTML = html;
}
// ---- how a visit's pads are shown in history ----
// Full lines, one per person: "💊 Dr. Huda Ali: Ortho care prescription ×5,
// Whitening prescription ×2". opts.only = one person's lines (without the name).
function rxLinesHTML(v, clinic, opts){
  opts = opts || {};
  if(!v || !rxReady()) return '';
  const only = _rxHas(opts, 'only');
  const lines = UMCore.visitRxLines(v).filter(l => !only || l.doctorId === opts.only);
  if(!lines.length) return '';
  const groups = [], at = {};
  lines.forEach(l => {
    const k = l.doctorId == null ? '' : '#' + l.doctorId;
    if(!at[k]){ at[k] = { key: l.doctorId == null ? '' : l.doctorId, items: [] }; groups.push(at[k]); }
    at[k].items.push(l);
  });
  return groups.map(g => `<div class="rx-hist" style="font-size:12.5px; color:var(--muted); margin-top:3px; overflow-wrap:anywhere;">${I('pill')} ${only ? '' : rxWhoHTML(g.key, clinic) + ': '}${g.items.map(l => `<span dir="auto">${esc(rxTypeNameOf(l.type, l.name))} ×${l.qty}</span>`).join(', ')}</div>`).join('');
}
// The pads of one visit in all (0 for calls, phone orders and visits without).
function rxPadsOf(v){ return rxReady() ? UMCore.visitRxLines(v).reduce((s, l) => s + l.qty, 0) : 0; }
// Short form for the one-line lists: '' or "N pads".
function rxShortText(v){ const n = rxPadsOf(v); return n > 0 ? rxPadsText(n) : ''; }
// The separator lives inside its own span, so the text before it ("No order")
// stays a text node of its own and is still translated.
function rxShortHTML(v){ const t = rxShortText(v); return t ? `<span class="rx-short"> · ${I('pill')}<span>${t}</span></span>` : ''; }
// The lines as one plain sentence (search, copy as text, the CSV): names by id.
function rxTextOf(v, clinic){
  if(!rxReady() || typeof UMCore.rxText !== 'function') return '';
  const c = clinic || clinics.find(x => x.id === v.clinicId);
  return UMCore.rxText(UMCore.visitRxLines(v), { list: rxTypes(), doctorName: id => { const d = ((c && c.doctors) || []).find(x => x && x.id === id); return d ? d.name : null; } });
}
