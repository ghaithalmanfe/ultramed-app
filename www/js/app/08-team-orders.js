// team management, phone orders, call log, edit visit
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- TEAM MANAGEMENT ----
function openStaffForm(idx){
  const editing = idx!==undefined && staff[idx];
  const s = editing ? staff[idx] : {name:'', role:'rep', email:'', av:AVATARS[staff.length % AVATARS.length]};
  showModal(`
    <h3 style="margin-top:0;">${editing?'Edit':'Add'} team member</h3>
    <label>Name (as shown in the app)</label>
    <input type="text" id="sfName" value="${esc(s.name)}" placeholder="e.g. Sara">
    <label>Login email</label>
    <input type="email" id="sfEmail" value="${esc(s.email)}" placeholder="name@ultramed-kw.com">
    <label>Role</label>
    <div class="chip-row" id="sfRole">
      <div class="chip small ${s.role==='rep'?'on':''}" data-role="rep" onclick="pickModalCls(this)">🦷 Sales Rep</div>
      <div class="chip small ${s.role==='supervisor'?'on':''}" data-role="supervisor" onclick="pickModalCls(this)">⭐ Supervisor</div>
    </div>
    <button class="btn" onclick="saveStaff(${editing?idx:-1})">Save</button>
    ${editing?`<button class="btn ghost" onclick="removeStaff(${idx})">Remove from team</button>`:''}
  `);
}
async function saveStaff(idx){
  if(!requireAdmin()) return;
  const name = document.getElementById('sfName').value.trim();
  const email = document.getElementById('sfEmail').value.trim().toLowerCase();
  const roleEl = document.querySelector('#sfRole .chip.on');
  const role = roleEl ? roleEl.dataset.role : 'rep';
  if(!name){ showToast('Enter a name'); return; }
  if(!email || !email.includes('@')){ showToast('Enter a valid email'); return; }
  const clash = staff.find((s,i)=>i!==idx && (s.name.toLowerCase()===name.toLowerCase() || s.email===email));
  if(clash){ showToast('That name or email is already used'); return; }
  if(idx>=0){
    const prevName = staff[idx].name;
    staff[idx] = {...staff[idx], name, email, role};
    if(prevName !== name){
      // Keep existing records pointing at this person
      clinics.forEach(c=>{ if(c.rep===prevName) c.rep = name; });
      visits.forEach(v=>{ if(v.rep===prevName) v.rep = name; });
      tasks.forEach(t=>{ if(t.rep===prevName) t.rep = name; });
      Object.keys(dayPlans).forEach(d=>{
        if(dayPlans[d] && dayPlans[d][prevName]){
          const moved = dayPlans[d][prevName], have = dayPlans[d][name] || [];
          const ids = new Set(have.map(planEntryId));
          dayPlans[d][name] = have.concat(moved.filter(e=>!ids.has(planEntryId(e)))); // never two copies of a plan
          delete dayPlans[d][prevName];
          tomb('dayPlans', d+'|'+prevName);
        }
      });
      visits.forEach(v=>{ if(v.withRep===prevName) v.withRep = name; });
      events.forEach(e=>{ if(e.rep===prevName) e.rep = name; });
      // the month target and its archived months
      if(targets[prevName] && !targets[name]){ targets[name] = targets[prevName]; delete targets[prevName]; }
      Object.keys(targets._history||{}).forEach(m=>{ const h = targets._history[m]; if(h && h[prevName] && !h[name]){ h[name] = h[prevName]; delete h[prevName]; } });
      // ERP salesman → rep mappings
      erpPeriods().forEach(pp=>{ Object.keys(pp.repMap||{}).forEach(k=>{ if(pp.repMap[k]===prevName) pp.repMap[k]=name; }); });
      Object.keys(erpSales.repMapGlobal||{}).forEach(k=>{ if(erpSales.repMapGlobal[k]===prevName) erpSales.repMapGlobal[k]=name; });
      if(logAsRep===prevName) logAsRep = name;
      if(clinicRepFilter===prevName) clinicRepFilter = name;
      if(reportRepFilter===prevName) reportRepFilter = name;
      if(calRepFilter===prevName) calRepFilter = name;
      await Promise.all([persist('clinics'), persist('visits'), persist('tasks'), persist('dayPlans'), persist('events'), persist('targets'), persist('erpSales')]);
    }
  } else {
    staff.push({name, email, role, av:AVATARS[staff.length % AVATARS.length]});
  }
  refreshStaff();
  await persist('staff');
  closeModal();
  showToast('✅ Team updated');
  renderGate();
  renderAll();
  openAdminPanel(); setAdminTab('staff');
}
async function removeStaff(idx){
  if(!requireAdmin()) return;
  const s = staff[idx];
  if(!s) return;
  if(staff.filter(x=>x.role==='supervisor').length===1 && s.role==='supervisor'){
    showToast('Keep at least one supervisor'); return;
  }
  const cCount = clinics.filter(c=>c.rep===s.name).length;
  showModal(`
    <h3 style="margin-top:0;">Remove ${esc(s.name)}?</h3>
    ${cCount?`<div class="card" style="background:var(--amber-dim); margin-bottom:12px;"><strong>${cCount}</strong> clinic${cCount===1?'':'s'} assigned to ${esc(s.name)} will become unassigned. Reassign them from the Territory tab afterwards.</div>`:''}
    <p style="color:var(--muted); font-size:13px;">Their past visits stay in the records. Their login must be removed separately in Firebase.</p>
    <button class="btn" style="background:var(--coral);" onclick="confirmRemoveStaff(${idx})">Yes, remove</button>
    <button class="btn secondary" onclick="openStaffForm(${idx})">Cancel</button>
  `);
}
async function confirmRemoveStaff(idx){
  if(!requireAdmin()) return;
  const s = staff[idx];
  if(!s) return;
  staff.splice(idx,1);
  refreshStaff();
  await persist('staff');
  closeModal();
  showToast(`${s.name} removed`);
  renderGate();
  renderAll();
  openAdminPanel(); setAdminTab('staff');
}

// ---- STANDALONE ORDER (no field visit) ----
let soClinicId = null, soItems = {}, soDiscount = 0;
function openStandaloneOrder(prefillClinicId){
  soClinicId = prefillClinicId || null;
  soItems = {}; soDiscount = 0;
  soNewClinicMode = false;
  showModal(`
    <h3 style="margin-top:0;">${I('cart')} Add order</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">For phone or remote orders — recorded as revenue, not as a field visit.</p>
    <label>Clinic</label>
    <input type="text" id="soClinicSearch" placeholder="Search clinics..." oninput="renderSoClinics()" style="margin-bottom:8px;">
    <div id="soClinicPick"></div>
    <button class="btn secondary small" id="soNewClinicBtn" onclick="startSoNewClinic()">+ Add a new customer</button>
    <div id="soNewClinicFields" style="display:none; margin-top:10px;">
      <input type="text" id="soNewClinicName" placeholder="Clinic / customer name">
      <input type="tel" id="soNewClinicPhone" placeholder="Phone (optional)" style="margin-top:8px;">
      <label>Class</label>
      <div class="chip-row" id="soNewClinicClsChips"></div>
      <button class="btn ghost" onclick="cancelSoNewClinic()">Cancel</button>
    </div>
    <label>Date</label>
    <input type="date" id="soDate" value="${todayStr()}" max="${todayStr()}">
    <label>Products</label>
    <input type="text" id="soProdSearch" placeholder="Search products..." oninput="renderSoProducts()" style="margin-bottom:8px;">
    <div class="chip-row" id="soProdChips" style="max-height:160px; overflow-y:auto;"></div>
    <div id="soQtyWrap"></div>
    <label>Discount</label>
    <div class="chip-row" id="soDiscChips">
      ${DISCOUNT_PRESETS.map(d=>`<div class="chip small ${d===0?'on':''}" onclick="setSoDiscount(this,${d})">${d===0?'None':d+'%'}</div>`).join('')}
    </div>
    <div id="soTotal" class="card" style="background:var(--teal-dim); margin-top:12px;"></div>
    <label>Notes</label>
    <textarea id="soNotes" placeholder="PO number, delivery instructions, who called..."></textarea>
    <button class="btn" onclick="saveStandaloneOrder()">Save order</button>
  `);
  renderSoClinics(); renderSoProducts(); renderSoQty();
}
let soNewClinicMode = false;
function startSoNewClinic(){
  soNewClinicMode = true;
  soClinicId = null;
  document.getElementById('soNewClinicFields').style.display='block';
  document.getElementById('soClinicPick').style.display='none';
  document.getElementById('soNewClinicBtn').style.display='none';
  document.getElementById('soNewClinicClsChips').innerHTML =
    ['A','B','C','D','F'].map(c=>`<div class="chip small" data-cls="${c}" onclick="pickModalCls(this)">${c}</div>`).join('');
}
function cancelSoNewClinic(){
  soNewClinicMode = false;
  document.getElementById('soNewClinicFields').style.display='none';
  document.getElementById('soClinicPick').style.display='';
  document.getElementById('soNewClinicBtn').style.display='';
  renderSoClinics();
}
function renderSoClinics(){
  const q = (document.getElementById('soClinicSearch')?.value||'').toLowerCase().trim();
  const el = document.getElementById('soClinicPick');
  if(soClinicId){
    const c = clinics.find(x=>x.id===soClinicId);
    if(c){
      el.innerHTML = `<div class="card" style="border-inline-start:4px solid ${clsColor(c.cls)};">
        <div class="row-between"><div class="clinic-name">${esc(c.name)}</div>
        <button class="del" onclick="soClinicId=null; renderSoClinics();">&times;</button></div></div>`;
      return;
    }
  }
  let pool = clinics.filter(c=>c.cls!=='Closed');
  if(currentUser.role!=='supervisor') pool = pool.filter(c=>c.rep===currentUser.name);
  if(q) pool = pool.filter(c=>c.name.toLowerCase().includes(q));
  pool = pool.sort((a,b)=>a.name.localeCompare(b.name)).slice(0, q?12:6);
  el.innerHTML = pool.length ? pool.map(c=>`
    <div class="card clickable" style="padding:11px 14px; border-inline-start:4px solid ${clsColor(c.cls)};" onclick="soClinicId='${c.id}'; renderSoClinics();">
      <div class="clinic-name">${esc(c.name)}</div>
      <div class="clinic-sub">${esc(c.rep||'')}</div>
    </div>`).join('') : `<div style="color:var(--muted); font-size:13px;">No clinic matches.</div>`;
}
function renderSoProducts(){
  const q = (document.getElementById('soProdSearch')?.value||'').toLowerCase().trim();
  let list = products;
  if(q) list = list.filter(p=>p.name.toLowerCase().includes(q) || (p.brand||'').toLowerCase().includes(q));
  list = list.slice(0, q?40:14);
  document.getElementById('soProdChips').innerHTML = list.map(p=>
    `<div class="chip small ${soItems[productKey(p)]?'on':''}" data-key="${esc(productKey(p))}" onclick="toggleSoProduct('${esc(productKey(p))}')">${esc(p.name)}</div>`).join('');
}
function toggleSoProduct(id){
  if(soItems[id]) delete soItems[id]; else soItems[id] = 1;
  renderSoProducts(); renderSoQty();
}
function renderSoQty(){
  const ids = Object.keys(soItems);
  const wrap = document.getElementById('soQtyWrap');
  wrap.innerHTML = ids.length ? `<label>Quantities</label><div class="card">` + ids.map(id=>{
    const p = findProduct(id);
    if(!p) return '';
    return `<div class="qty-row">
      <div class="pname">${esc(p.name)}<br><span style="color:var(--muted); font-size:11.5px;">${p.price!=null?money(p.price)+' each':'no price'}</span></div>
      <input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="9999" step="1" value="${soItems[id]}" onfocus="this.select()" oninput="setSoQty('${esc(id)}', this.value)" onchange="settleSoQty('${esc(id)}', this)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">
    </div>`;
  }).join('') + `</div>` : '';
  renderSoTotal();
}
function setSoQty(id, val){
  if(String(val).trim()==='') return; // mid-edit — keep the line until a number arrives
  const n = cleanQty(val);
  if(n===0) delete soItems[id]; else soItems[id] = n;
  renderSoTotal();
}
// Leaving the box: an emptied or zero box means "no more of this" — the line
// goes and its chip unlights, in place (no rebuild that would eat the next tap).
function settleSoQty(id, inputEl){
  const n = cleanQty(inputEl.value);
  if(n===0){
    delete soItems[id];
    const row = inputEl.closest('.qty-row'); if(row) row.remove();
    const chip = document.querySelector(`#soProdChips .chip[data-key="${CSS.escape(id)}"]`); if(chip) chip.classList.remove('on');
    const wrap = document.getElementById('soQtyWrap'); if(wrap && !wrap.querySelector('.qty-row')) wrap.innerHTML = '';
  } else { soItems[id] = n; inputEl.value = n; }
  renderSoTotal();
}
function setSoDiscount(el, d){
  soDiscount = d;
  el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  renderSoTotal();
}
function soTotals(){ return UMCore.orderTotals(soItems, soDiscount, products); }
function renderSoTotal(){
  const el = document.getElementById('soTotal');
  if(!el) return;
  const t = soTotals();
  el.innerHTML = `
    <div class="row-between" style="font-size:13px;"><span>Subtotal</span><span>${money(t.gross)}</span></div>
    ${soDiscount?`<div class="row-between" style="font-size:12.5px; color:var(--coral-ink); margin-top:4px;"><span>Discount (${soDiscount}%)</span><span>− ${money(t.disc)}</span></div>`:''}
    <div class="row-between" style="margin-top:6px; padding-top:6px; border-top:1px solid var(--line); font-weight:700;"><span>Order total</span><span>${money(t.net)}</span></div>`;
}
async function saveStandaloneOrder(){
  let soNewCreated = false;
  if(soNewClinicMode){
    const name = document.getElementById('soNewClinicName').value.trim();
    if(!name){ showToast('Enter the customer name'); return; }
    const dup = clinics.find(c=>c.name.toLowerCase()===name.toLowerCase());
    if(dup){ soClinicId = dup.id; showToast('Customer already exists — using it'); }
    else {
      const clsEl = document.querySelector('#soNewClinicClsChips .chip.on');
      soClinicId = uid();
      clinics.push(normalizeClinic({id:soClinicId, name, rep: currentUser.name,
        cls: clsEl?clsEl.dataset.cls:null, market:null, notes:'', account:null,
        isNew:true, addedOn:todayStr(), contact:'',
        phone: document.getElementById('soNewClinicPhone').value.trim()}));
      soNewCreated = true;
    }
  }
  if(!soClinicId){ showToast('Pick a clinic first'); return; }
  // Snapshot name and unit price so the order keeps its true value even if the
  // catalog price changes later.
  const items = Object.keys(soItems).filter(id=>soItems[id]>0).map(id=>{
    const p = findProduct(id);
    return {productId:id, qty:soItems[id], unitPrice: p&&p.price!=null ? p.price : null, name: p?p.name:''};
  });
  if(!items.length){ showToast('Add at least one product'); return; }
  const date = document.getElementById('soDate').value || todayStr();
  const notes = document.getElementById('soNotes').value.trim();
  const t = soTotals();
  const clinic = clinics.find(c=>c.id===soClinicId);
  const rep = currentUser.role==='supervisor' ? (clinic?clinic.rep:currentUser.name) : currentUser.name;
  const order = {id:uid(), items, discountPct:soDiscount, gross:t.gross, discountAmount:t.disc, total:t.net, notes};
  visits.push({
    id:uid(), clinicId:soClinicId, rep, date, orderOnly:true,
    products:items.map(i=>i.productId), orderTaken:true, orders:[order], orderItems:items,
    orderGross:t.gross, orderDiscount:t.disc, orderTotal:t.net,
    nextFollowUp:null, notes
  });
  await Promise.all([persist('visits'), soNewCreated ? persist('clinics') : Promise.resolve()]);
  soNewClinicMode = false;
  closeModal();
  showToast(soNewCreated ? `🌟 New customer added · 🛒 Order saved — ${money(t.net)}` : `🛒 Order saved — ${money(t.net)}`);
  renderAll();
}

// ---- CALL / REMOTE FOLLOW-UP LOG ----
// Phone calls, WhatsApp, anything that isn't a field visit but is still
// real work — gives it a place to be recorded and counted, instead of
// being invisible just because it didn't happen at a clinic.
let clClinicId = null, clDoctorId = null;
function openCallLog(prefillClinicId){
  clClinicId = prefillClinicId || null;
  clDoctorId = null;
  clNewClinicMode = false;
  showModal(`
    <h3 style="margin-top:0;">${I('phone')} Log a call / follow-up</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">For phone calls, WhatsApp, or anything that isn't a field visit — counted as real work, not a clinic visit.</p>
    <label>Channel</label>
    <div class="chip-row" id="clChannelChips">
      ${[['call','📞 Call'],['whatsapp','💬 WhatsApp'],['email','✉️ Email'],['other','💭 Other']].map(([k,l],i)=>`<div class="chip small ${i===0?'on':''}" data-ch="${k}" onclick="pickModalCls(this)">${l}</div>`).join('')}
    </div>
    <label>Clinic</label>
    <input type="text" id="clClinicSearch" placeholder="Search clinics..." oninput="renderClClinics()" style="margin-bottom:8px;">
    <div id="clClinicPick"></div>
    <button class="btn secondary small" id="clNewClinicBtn" onclick="startClNewClinic()">+ Add a new customer</button>
    <div id="clNewClinicFields" style="display:none; margin-top:10px;">
      <input type="text" id="clNewClinicName" placeholder="Clinic / customer name">
      <input type="tel" id="clNewClinicPhone" placeholder="Phone (optional)" style="margin-top:8px;">
      <label>Class</label>
      <div class="chip-row" id="clNewClinicClsChips"></div>
      <button class="btn ghost" onclick="cancelClNewClinic()">Cancel</button>
    </div>
    <div id="clDoctorWrap"></div>
    <label>Who did you speak with?</label>
    <input type="text" id="clContactName" placeholder="Name (doctor, receptionist, procurement...)">
    <div class="row-between" style="gap:10px; margin-top:8px;">
      <input type="text" id="clContactRole" placeholder="Their role (optional)">
      <input type="tel" id="clContactPhone" placeholder="Phone (optional)">
    </div>
    <label>What happened?</label>
    <textarea id="clNotes" placeholder="e.g. Called to confirm delivery date, followed up on a pending order..."></textarea>
    <label>Next follow-up (optional)</label>
    <div class="quickdate" id="clQuickDates">
      ${[{l:'+3 days',d:3},{l:'+1 week',d:7},{l:'+2 weeks',d:14},{l:'+1 month',d:30}].map(o=>`<button data-days="${o.d}" onclick="pickClQuickDate(${o.d})">${o.l}</button>`).join('')}
    </div>
    <input type="date" id="clFollowUp">
    <button class="btn" onclick="saveCallLog()">Save</button>
  `);
  renderClClinics();
}
let clNewClinicMode = false;
function startClNewClinic(){
  clNewClinicMode = true;
  clClinicId = null; clDoctorId = null;
  document.getElementById('clNewClinicFields').style.display='block';
  document.getElementById('clClinicPick').style.display='none';
  document.getElementById('clNewClinicBtn').style.display='none';
  document.getElementById('clDoctorWrap').innerHTML='';
  document.getElementById('clNewClinicClsChips').innerHTML =
    ['A','B','C','D','F'].map(c=>`<div class="chip small" data-cls="${c}" onclick="pickModalCls(this)">${c}</div>`).join('');
}
function cancelClNewClinic(){
  clNewClinicMode = false;
  document.getElementById('clNewClinicFields').style.display='none';
  document.getElementById('clClinicPick').style.display='';
  document.getElementById('clNewClinicBtn').style.display='';
  renderClClinics();
}
function renderClClinics(){
  const q = (document.getElementById('clClinicSearch')?.value||'').toLowerCase().trim();
  const el = document.getElementById('clClinicPick');
  if(clClinicId){
    const c = clinics.find(x=>x.id===clClinicId);
    if(c){
      el.innerHTML = `<div class="card" style="border-inline-start:4px solid ${clsColor(c.cls)};">
        <div class="row-between"><div class="clinic-name">${esc(c.name)}</div>
        <button class="del" onclick="clClinicId=null; clDoctorId=null; renderClClinics();">&times;</button></div></div>`;
      renderClDoctors();
      return;
    }
  }
  let pool = clinics.filter(c=>c.cls!=='Closed');
  if(currentUser.role!=='supervisor') pool = pool.filter(c=>c.rep===currentUser.name);
  if(q) pool = pool.filter(c=>c.name.toLowerCase().includes(q));
  pool = pool.sort((a,b)=>a.name.localeCompare(b.name)).slice(0, q?12:6);
  el.innerHTML = pool.length ? pool.map(c=>`
    <div class="card clickable" style="padding:11px 14px; border-inline-start:4px solid ${clsColor(c.cls)};" onclick="clClinicId='${c.id}'; renderClClinics();">
      <div class="clinic-name">${esc(c.name)}</div>
      <div class="clinic-sub">${esc(c.rep||'')}</div>
    </div>`).join('') : `<div style="color:var(--muted); font-size:13px;">No clinic matches.</div>`;
  document.getElementById('clDoctorWrap').innerHTML = '';
}
function renderClDoctors(){
  const wrap = document.getElementById('clDoctorWrap');
  const c = clinics.find(x=>x.id===clClinicId);
  if(!c || !(c.doctors||[]).length){ wrap.innerHTML=''; return; }
  wrap.innerHTML = `<label>Doctor (optional)</label><div class="chip-row">${c.doctors.map(d=>`<div class="chip small ${clDoctorId===d.id?'on':''}" onclick="clDoctorId=(clDoctorId==='${d.id}'?null:'${d.id}'); renderClDoctors();">${esc(d.name)}</div>`).join('')}</div>`;
}
function pickClQuickDate(days){
  document.querySelectorAll('#clQuickDates button').forEach(b=>b.classList.toggle('on', parseInt(b.dataset.days)===days));
  const d = new Date(); d.setDate(d.getDate()+days);
  document.getElementById('clFollowUp').value = localDateStr(d);
}
const CHANNEL_LABELS = {call:'📞 Call', whatsapp:'💬 WhatsApp', email:'✉️ Email', other:'💭 Other'};
async function saveCallLog(){
  let newClinicCreated = false;
  if(clNewClinicMode){
    const name = document.getElementById('clNewClinicName').value.trim();
    if(!name){ showToast('Enter the customer name'); return; }
    const dup = clinics.find(c=>c.name.toLowerCase()===name.toLowerCase());
    if(dup){ clClinicId = dup.id; showToast('Customer already exists — using it'); }
    else {
      const clsEl = document.querySelector('#clNewClinicClsChips .chip.on');
      clClinicId = uid();
      clinics.push(normalizeClinic({id:clClinicId, name, rep: currentUser.name,
        cls: clsEl?clsEl.dataset.cls:null, market:null, notes:'', account:null,
        isNew:true, addedOn:todayStr(), contact:'',
        phone: document.getElementById('clNewClinicPhone').value.trim()}));
      newClinicCreated = true;
    }
  }
  if(!clClinicId){ showToast('Pick a clinic first'); return; }
  const notes = document.getElementById('clNotes').value.trim();
  if(!notes){ showToast('Add a quick note about the call'); return; }
  const clinic = clinics.find(c=>c.id===clClinicId);
  const rep = currentUser.role==='supervisor' ? (clinic?clinic.rep:currentUser.name) : currentUser.name;
  const followUp = document.getElementById('clFollowUp').value || null;
  const channelEl = document.querySelector('#clChannelChips .chip.on');
  const channel = channelEl ? channelEl.dataset.ch : 'call';
  const contactName = document.getElementById('clContactName').value.trim();
  const contactRole = document.getElementById('clContactRole').value.trim();
  const contactPhone = document.getElementById('clContactPhone').value.trim();
  visits.push({id:uid(), clinicId:clClinicId, rep, date:todayStr(), ts:Date.now(), callOnly:true, channel, doctorId:clDoctorId||null,
    contactName: contactName||null, contactRole: contactRole||null, contactPhone: contactPhone||null,
    notes, nextFollowUp:followUp});
  if(clinic && followUp) clinic.nextFollowUp = followUp;
  await Promise.all([persist('visits'), (clinic || newClinicCreated) ? persist('clinics') : Promise.resolve()]);
  if(clinic && followUp) await scheduleFollowUp(clinic, followUp, rep);
  clNewClinicMode = false;
  closeModal();
  showToast(newClinicCreated ? '🌟 New customer added + '+CHANNEL_LABELS[channel]+' logged' : CHANNEL_LABELS[channel]+' logged');
  renderAll();
}

// ---- EDIT A LOGGED VISIT ----
function openEditVisit(visitId){
  const v = visits.find(x=>x.id===visitId);
  if(!v){ showToast('Visit not found'); return; }
  if(!canEditVisit(v)){ showToast('You can only edit your own visits'); return; }
  const c = clinics.find(x=>x.id===v.clinicId);
  showModal(`
    <h3 style="margin-top:0;">Edit ${v.orderOnly?'order':'visit'}</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">${esc(c?c.name:clinicLabel(v.clinicId, v))}</p>
    <label>Date</label>
    <input type="date" id="evDate" value="${v.date}" max="${todayStr()}">
    ${!v.orderOnly && !v.callOnly ? `
    <label>Joint visit with</label>
    <select id="evJoint">
      <option value="">Solo visit</option>
      ${REPS.filter(r=>r!==v.rep).map(r=>`<option value="${esc(r)}" ${v.withRep===r?'selected':''}>🤝 ${esc(r)}</option>`).join('')}
    </select>` : ''}
    <label>Next follow-up</label>
    <input type="date" id="evFollow" value="${v.nextFollowUp||''}">
    <label>Notes</label>
    <textarea id="evNotes" dir="auto" placeholder="What happened on this visit...">${esc(v.notes||'')}</textarea>
    ${!v.orderOnly && !v.callOnly ? `
    <label>Who did you meet?</label>
    <div class="chip-row" id="editDocChips"></div>
    <label>Photos</label>
    <div class="photo-row" id="editPhotoRow"></div>` : ''}
    ${v.orderTaken?`
      <label>Order total (KD)</label>
      <input type="number" step="0.01" min="0" id="evTotal" value="${v.orderTotal||0}">
      <p style="color:var(--muted); font-size:12px; margin-top:6px;">Adjusts the recorded value. To change line items, delete and re-enter the order.</p>
    `:''}
    <button class="btn" onclick="saveEditVisit('${v.id}')">Save changes</button>
    ${(currentUser.role==='supervisor' || v.rep===currentUser.name) ? `<button class="btn ghost" onclick="confirmDeleteVisit('${v.id}')">Delete this ${v.orderOnly?'order':'visit'}</button>` : `<div style="color:var(--muted); font-size:12px; text-align:center; margin-top:6px;">Only ${esc(v.rep)} or the supervisor can delete this visit.</div>`}
  `);
  if(!v.orderOnly && !v.callOnly){
    window._editDocIds = Array.isArray(v.doctorIds) && v.doctorIds.length ? v.doctorIds.slice() : (v.doctorId ? [v.doctorId] : []);
    renderEditDocChips(visitId);
    renderEditPhotos(visitId);
  }
}
function renderEditDocChips(visitId){
  const v = visits.find(x=>x.id===visitId);
  const el = document.getElementById('editDocChips');
  if(!v || !el) return;
  const c = clinics.find(x=>x.id===v.clinicId);
  const docs = (c && c.doctors) || [];
  el.innerHTML = docs.length
    ? docs.map(d=>`<div class="chip small ${window._editDocIds.includes(d.id)?'on':''}" onclick="toggleEditDoc('${visitId}','${d.id}')">${esc(d.name)}</div>`).join('')
    : '<div style="color:var(--muted); font-size:12.5px;">No doctors on this clinic\'s profile yet — add them from the clinic page.</div>';
}
function toggleEditDoc(visitId, docId){
  if(window._editDocIds.includes(docId)) window._editDocIds = window._editDocIds.filter(x=>x!==docId);
  else window._editDocIds.push(docId);
  renderEditDocChips(visitId);
}
function renderEditPhotos(visitId){
  const v = visits.find(x=>x.id===visitId);
  const el = document.getElementById('editPhotoRow');
  if(!v || !el) return;
  el.innerHTML = (v.photos||[]).map(p=>`<div class="ph-wrap">
      <img class="photo-thumb" src="${p.thumb}" onclick="showLightbox('${p.id}','Visit photo')">
      <button class="ph-del" onclick="removeEditPhoto('${visitId}','${p.id}')">&times;</button>
    </div>`).join('') +
    `<div class="photo-add" onclick="addEditPhoto('${visitId}')">\u{1F4F7}<span>ADD</span></div>`;
}
function addEditPhoto(visitId){
  const v = visits.find(x=>x.id===visitId);
  if(!v || !canEditVisit(v)) return;
  pickImage(async ({full, thumb})=>{
    const id = uid();
    if(await savePhotoBlob(id, full)){
      v.photos = v.photos || [];
      v.photos.push({id, thumb});
      await persist('visits');
      renderEditPhotos(visitId);
      showToast('\u{1F4F8} Photo added');
    }
  }, true);
}
async function removeEditPhoto(visitId, photoId){
  const v = visits.find(x=>x.id===visitId);
  if(!v || !canEditVisit(v)) return;
  v.photos = (v.photos||[]).filter(p=>p.id!==photoId);
  try{ await window.storage.delete('photo:'+photoId, true); }catch(e){}
  await persist('visits');
  renderEditPhotos(visitId);
}
async function saveEditVisit(visitId){
  const v = visits.find(x=>x.id===visitId);
  if(!v) return;
  if(!canEditVisit(v)){ showToast('Not allowed'); return; }
  const newDate = document.getElementById('evDate').value;
  if(!newDate){ showToast('Pick a date'); return; }
  const newNotes = document.getElementById('evNotes').value.trim();
  const newFollow = document.getElementById('evFollow').value || null;
  const prevFollow = v.nextFollowUp || null;
  const totalEl = document.getElementById('evTotal');
  const newTotal = totalEl ? parseFloat(totalEl.value) : null;
  const jointEl = document.getElementById('evJoint');
  const newJoint = jointEl ? (jointEl.value || null) : (v.withRep || null);
  const docsEl = document.getElementById('editDocChips');
  const prevDocIds = Array.isArray(v.doctorIds) && v.doctorIds.length ? v.doctorIds : (v.doctorId ? [v.doctorId] : []);
  const docsChanged = docsEl && JSON.stringify(window._editDocIds) !== JSON.stringify(prevDocIds);
  const changed = newDate!==v.date || newNotes!==(v.notes||'') || newFollow!==(v.nextFollowUp||null) || newJoint!==(v.withRep||null) || docsChanged || (totalEl && !isNaN(newTotal) && newTotal>=0 && Math.round(newTotal*100)/100!==v.orderTotal);
  if(changed){
    v.editHistory = v.editHistory || [];
    v.editHistory.push({editedBy:currentUser.name, editedAt:Date.now(), prevDate:v.date, prevNotes:v.notes||'', prevFollowUp:v.nextFollowUp||null, prevTotal:v.orderTotal});
  }
  if(jointEl) v.withRep = newJoint===v.rep ? null : newJoint;
  if(docsEl){ v.doctorIds = window._editDocIds.slice(); v.doctorId = v.doctorIds[0] || null; }
  v.date = newDate;
  v.nextFollowUp = newFollow;
  v.notes = newNotes;
  if(totalEl){
    const n = newTotal;
    if(!isNaN(n) && n>=0){
      v.orderTotal = Math.round(n*100)/100;
      // an overridden total re-derives the discount, so gross − discount = net still holds in every export
      const gross = v.orderGross != null ? v.orderGross : (v.orders && v.orders.length===1 ? v.orders[0].gross : null);
      if(gross != null){
        const discAmt = Math.round(Math.max(0, gross - v.orderTotal)*100)/100;
        v.orderDiscount = discAmt;
        if(v.orders && v.orders.length===1){
          v.orders[0].total = v.orderTotal;
          v.orders[0].discountAmount = discAmt;
          v.orders[0].discountPct = gross > 0 ? Math.round(discAmt/gross*10000)/100 : 0;
        }
      } else if(v.orders && v.orders.length===1) v.orders[0].total = v.orderTotal;
    }
  }
  // Keep the clinic's rollup fields consistent with its remaining visits
  const clinic = clinics.find(c=>c.id===v.clinicId);
  const followChanged = newFollow !== (prevFollow || null);
  if(clinic){
    const cv = visits.filter(x=>x.clinicId===clinic.id && isFieldVisit(x));
    clinic.lastVisit = cv.length ? cv.map(x=>x.date).sort().slice(-1)[0] : null;
    if(v.nextFollowUp) clinic.nextFollowUp = v.nextFollowUp;
    else if(followChanged && (clinic.nextFollowUp||null) === (prevFollow||null)) clinic.nextFollowUp = null; // the follow-up this visit had set was cleared
  }
  await Promise.all([persist('visits'), persist('clinics')]);
  // The auto-created follow-up task and day-plan entry follow the new date.
  if(clinic && followChanged) await scheduleFollowUp(clinic, v.nextFollowUp, v.rep);
  closeModal();
  showToast('✅ Changes saved');
  renderAll();
  if(document.getElementById('vlBody')) renderVisitLog();
}
function showEditHistory(visitId){
  const v = visits.find(x=>x.id===visitId);
  if(!v || !v.editHistory || !v.editHistory.length) return;
  showModal(`
    <h3 style="margin-top:0;">Edit history</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">What this visit looked like before each edit.</p>
    ${[...v.editHistory].reverse().map(h=>`<div class="card" style="margin-bottom:8px;">
      <div class="clinic-sub" style="margin-bottom:6px;">Edited by <strong>${esc(h.editedBy)}</strong> · ${fmtWhen(h.editedAt)}</div>
      <div style="font-size:13px;">Was: ${fmtDate(h.prevDate)}${h.prevTotal?' · '+money(h.prevTotal):''}${h.prevFollowUp?' · next follow-up '+fmtDate(h.prevFollowUp):''}</div>
      ${h.prevNotes?`<div style="font-size:12.5px; color:var(--muted); margin-top:4px;">"${esc(h.prevNotes)}"</div>`:''}
    </div>`).join('')}
  `);
}
function confirmDeleteVisit(visitId){
  const v = visits.find(x=>x.id===visitId);
  if(!v) return;
  const c = clinics.find(x=>x.id===v.clinicId);
  showModal(`
    <h3 style="margin-top:0;">Delete this ${v.orderOnly?'order':'visit'}?</h3>
    <div class="card" style="border-inline-start:4px solid var(--coral); margin-bottom:14px;">
      <div class="clinic-name">${esc(c?c.name:clinicLabel(v.clinicId, v))}</div>
      <div class="clinic-sub">${fmtDate(v.date)}${v.orderTaken?' · '+money(v.orderTotal):''} · ${esc(v.rep)}</div>
      ${v.notes?`<div dir="auto" style="font-size:12.5px; margin-top:6px;">${esc(v.notes)}</div>`:''}
    </div>
    <p style="color:var(--muted); font-size:13px;">It moves to the recycle bin and can be restored within ${BIN_DAYS} days.</p>
    <button class="btn" style="background:var(--coral);" onclick="deleteVisit('${v.id}')">Yes, delete it</button>
    <button class="btn secondary" onclick="openEditVisit('${v.id}')">Cancel</button>
  `);
}
async function deleteVisit(visitId){
  const v = visits.find(x=>x.id===visitId);
  if(!v) return;
  if(currentUser.role!=='supervisor' && v.rep!==currentUser.name){ showToast('Not allowed'); return; }
  const clinicId = v.clinicId;
  const c = clinics.find(x=>x.id===clinicId);
  if(!await moveToBin('visits', v, `${c?c.name:'Visit'} — ${fmtDate(v.date)}`)) return;
  tomb('visits', visitId);
  visits = visits.filter(x=>x.id!==visitId);
  const clinic = clinics.find(x=>x.id===clinicId);
  if(clinic){
    const cv = visits.filter(x=>x.clinicId===clinicId && isFieldVisit(x));
    clinic.lastVisit = cv.length ? cv.map(x=>x.date).sort().slice(-1)[0] : null;
  }
  await Promise.all([persist('visits'), persist('clinics')]);
  closeModal();
  showToast('Moved to recycle bin');
  renderAll();
}

