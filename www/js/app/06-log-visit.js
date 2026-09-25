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
          <div class="clinic-sub">${fmtDate(v.date)} · ${esc(v.rep)}${jointTag(v)}${v.orderTaken?' · '+money(v.orderTotal):''}</div>
        </div>
        ${canEditVisit(v)?`<button class="chip small" onclick="openEditVisit('${v.id}')">${I('pencil')}</button>`:''}
      </div>
    </div>`;
  }).join('');
}
function prepLogView(qClinicId){
  renderLogHistory();
  logAsRep = currentUser.role==='rep' ? currentUser.name : (REPS.includes(logAsRep) ? logAsRep : REPS[0]);
  const wrap = document.getElementById('logAsWrap');
  if(currentUser.role==='supervisor'){
    wrap.style.display = 'block';
    document.getElementById('logAsChips').innerHTML = REPS.map(r=>`<div class="chip ${logAsRep===r?'on':''}" onclick="setLogAsRep('${r}')">${r}</div>`).join('');
  } else {
    wrap.style.display = 'none';
  }
  jointRep = null;
  renderJointChips();
  selectedClinicId = qClinicId || null;
  selectedDoctorIds = [];
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
  const options = REPS.filter(r=>r!==logAsRep);
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
}
function cancelNewClinic(){
  newClinicMode = false;
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
}
function pickDoctorSeen(id){
  if(selectedDoctorIds.includes(id)) selectedDoctorIds = selectedDoctorIds.filter(x=>x!==id);
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
  if(currentUser.role === 'supervisor' && !REPS.includes(rep)){ window._lastVisitSaveAt = 0; showToast('Choose which rep you are logging for'); return; }
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
  if(visitPhotos.length){
    const ids=[];
    for(const ph of visitPhotos){ if(await savePhotoBlob(ph.id, ph.full)) ids.push({id:ph.id, thumb:ph.thumb}); }
    visit.photos = ids;
  }
  const clinic = clinics.find(c=>c.id===clinicId);
  visits.push(visit);
  if(clinic){ clinic.lastVisit = todayStr(); clinic.nextFollowUp = followUp; }

  const [okVisits] = await Promise.all([persist('visits'), persist('clinics')]);
  if(clinic) await scheduleFollowUp(clinic, followUp, rep);
  if(navigator.vibrate) navigator.vibrate(12); // a small physical "saved" cue in the field
  const outcome = persistOutcome('visits');
  if(okVisits) showToast(visitSavedMsg());
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

