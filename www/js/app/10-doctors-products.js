// doctors directory/CRM, contacts import, data-entry mode, products, playbook, guides, coverage board
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- DOCTORS DIRECTORY ----
function openDoctorsDirectory(){
  showModal(`
    <h3 style="margin-top:0;">Doctors directory</h3>
    <input type="text" id="docDirSearch" placeholder="Search doctors or clinics..." oninput="renderDoctorsDirectory()" style="margin-bottom:12px;">
    <div id="docDirList"></div>
  `);
  renderDoctorsDirectory();
}
function renderDoctorsDirectory(){
  const q = (document.getElementById('docDirSearch').value||'').toLowerCase();
  const withDocs = clinics.filter(c=>c.doctors.length>0 && canViewClinic(c)).sort((a,b)=>a.name.localeCompare(b.name));
  let html = '';
  withDocs.forEach(c=>{
    const matchedDocs = c.doctors.filter(d=>d.name.toLowerCase().includes(q)||c.name.toLowerCase().includes(q));
    if(matchedDocs.length===0) return;
    html += `<div class="doc-group-head">${esc(c.name)} <span class="rep-tag">${esc(c.rep||'')}</span></div>`;
    matchedDocs.forEach(d=>{
      html += `<div class="doc-row"><div class="dname">${esc(d.name)}</div>${d.title?'<div class="dsub">'+esc(d.title)+'</div>':''}</div>`;
    });
  });
  document.getElementById('docDirList').innerHTML = html || `<div class="empty">No doctors added yet. Add them from a clinic's detail page.</div>`;
}

// ---- PRODUCTS ----
let openBrands = new Set();
function renderProducts(){
  const q = (document.getElementById('productSearch').value||'').toLowerCase();
  const wrap = document.getElementById('productListWrap');
  const filtered = products.filter(p=>p.name.toLowerCase().includes(q) || (p.brand||'').toLowerCase().includes(q));
  const byBrand = {};
  filtered.forEach(p=>{ const b = p.brand||'Other'; (byBrand[b]=byBrand[b]||[]).push(p); });
  const brands = Object.keys(byBrand).sort((a,b)=>byBrand[b].length-byBrand[a].length || a.localeCompare(b));
  brands.forEach(b=>byBrand[b].sort((x,y)=>(x.cat||'').localeCompare(y.cat||'')||x.name.localeCompare(y.name)));
  if(brands.length===0){ wrap.innerHTML = `<div class="empty">No products found.</div>`; return; }
  if(q) brands.forEach(b=>openBrands.add(b));
  wrap.innerHTML = brands.map(b=>{
    const open = openBrands.has(b);
    return `<div class="brand-group card" style="padding:6px 12px;">
      <div class="brand-head" onclick="toggleBrand('${esc(b).replace(/'/g,"\\'")}')">
        <span style="display:flex; align-items:center; gap:9px;"><span class="swatch" style="width:12px;height:12px;border-radius:4px;background:${brandColor(b)}"></span>${esc(b)} <span class="count">(${byBrand[b].length})</span></span>
        <span style="color:var(--muted);">${open?'−':'+'}</span>
      </div>
      <div class="brand-body ${open?'open':''}" id="brand-${slugify(b)}">
        ${byBrand[b].map(p=>`<div class="product-item" style="cursor:pointer;" onclick="openProductDetail('${productKey(p)}')">${prodThumb(p)}<div class="pinfo"><div class="pname2">${esc(p.name)}${p.stock===false?' <span style="font-size:10px; background:var(--coral-dim); color:var(--coral-ink); padding:1px 6px; border-radius:6px; font-weight:700;">OUT</span>':''}</div><div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${esc(p.cat||'Tap for specs')}</div></div><span class="product-price">${p.price!=null?p.price.toFixed(2)+' KD':''}</span></div>`).join('')}
      </div>
    </div>`;
  }).join('');
}
function brandColor(b){
  const palette=['#57B85D','#5E5CE6','#FF9500','#FF3B30','#0F5257','#C98A1E','#34C759','#8E44AD','#16A085','#E67E22','#2980B9','#D35400'];
  let h=0; const str=String(b||'?');
  for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))>>>0;
  return palette[h%palette.length];
}
function prodThumb(p, cls){
  const c = cls||'pthumb';
  const col = brandColor(p.brand);
  const letter = esc(String(p.brand||'?').charAt(0).toUpperCase());
  const fb = `<div class="${c} pthumb-fb" style="background:${col};">${letter}</div>`;
  if(!p.img) return fb;
  return `<img class="${c}" src="${p.img}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fbc="${col}" data-fbl="${letter}" onerror="imgFallback(this)">`;
}
function imgFallback(el){
  const d=document.createElement('div');
  d.className = el.className+' pthumb-fb';
  d.style.background = el.dataset.fbc;
  d.textContent = el.dataset.fbl;
  if(el.parentNode) el.parentNode.replaceChild(d, el);
}
function slugify(s){ return UMCore.slugify(s); }
function toggleBrand(b){ if(openBrands.has(b)) openBrands.delete(b); else openBrands.add(b); renderProducts(); }
function openAddProduct(){
  showModal(`
    <h3 style="margin-top:0;">Add product</h3>
    <label>Product name</label>
    <input type="text" id="mProdName" placeholder="e.g. Digital X-ray Sensor">
    <label>Brand</label>
    <input type="text" id="mProdBrand" placeholder="e.g. Philips">
    <label>Price (KD, optional)</label>
    <input type="text" id="mProdPrice" placeholder="e.g. 12.5">
    <label>Image URL (optional)</label>
    <input type="text" id="mProdImg" placeholder="Paste a direct image link">
    <button class="btn" onclick="submitAddProduct()">Save product</button>
  `);
}
async function submitAddProduct(){
  const name = document.getElementById('mProdName').value.trim();
  if(!name){ showToast('Enter a product name'); return; }
  const priceVal = parseFloat(document.getElementById('mProdPrice').value);
  const dupP = products.find(x=>x.name.toLowerCase()===name.toLowerCase());
  if(dupP){ showToast('That product already exists'); return; }
  const imgVal = document.getElementById('mProdImg').value.trim();
  products.push({id:uid(), name, brand: document.getElementById('mProdBrand').value.trim() || 'Other', price: isNaN(priceVal)?null:priceVal, img: imgVal||undefined});
  await persist('products');
  closeModal();
  renderProducts();
  showToast('Product added');
}


// ---- PLAYBOOK ----
// Visual guidance: every product suggestion carries its PHOTO. ERP product
// names differ slightly from catalog names, so match by token overlap; when
// no photo exists (e.g. professional Univet gear) show a branded tile.
function findCatalogProduct(name){
  const nt = String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
  if(!nt.length) return null;
  let best = null, bestScore = 0;
  products.forEach(pr => {
    const pt = (pr.name+' '+(pr.brand||'')).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/);
    const ov = nt.filter(t=>pt.includes(t)).length;
    const score = ov / Math.max(1, Math.max(nt.length, Math.min(pt.length, nt.length+2)));
    if(ov >= Math.min(2, nt.length) && score > bestScore){ best = pr; bestScore = score; }
  });
  return bestScore >= 0.5 ? best : null;
}
const BRAND_TILE_COLORS = {waterpik:'#0E7490', philips:'#1D4ED8', tepe:'#CA8A04', hismile:'#7C3AED', flash:'#DC2626', undo:'#0F766E', univet:'#334155', silonn:'#9333EA', intensiv:'#B45309', eversmile:'#0891B2', bundles:'#15803D', 'the breath co':'#166534', 'beverly hills':'#991B1B', 'b&l biotech':'#3F6212', shenzhen:'#6D28D9'};
function playbookThumb(name, size){
  size = size || 44;
  const pr = findCatalogProduct(name);
  if(pr && pr.img) return `<img src="${esc(pr.img)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display='none'" style="width:${size}px; height:${size}px; object-fit:contain; border-radius:8px; background:#fff; border:1px solid var(--line); flex-shrink:0;">`;
  const b = UMCore.normBrand((pr && pr.brand) || String(name||'').split(' ')[0]);
  const col = BRAND_TILE_COLORS[b] || '#57B85D';
  const initial = String(name||'?').trim().charAt(0).toUpperCase();
  return `<div style="width:${size}px; height:${size}px; border-radius:8px; background:${col}1A; color:${col}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${Math.round(size*0.4)}px; flex-shrink:0;">${esc(initial)}</div>`;
}
// ---- DOCTORS DATABASE (CRM) ----
let ddTab = 'db', ddFilter = 'all';
function ddPool(){ return clinics.filter(c=>canViewClinic(c)); }
function renderDoctorsDb(){
  const body = document.getElementById('ddBody');
  if(!body) return;
  document.getElementById('ddTabDb').classList.toggle('on', ddTab==='db');
  document.getElementById('ddTabRx').classList.toggle('on', ddTab==='rx');
  const q = ((document.getElementById('ddSearch')||{}).value||'').trim().toLowerCase();
  const repFilter = currentUser.role==='supervisor' ? 'all' : currentUser.name;
  const docs = UMCore.doctorAnalytics({clinics: ddPool(), visits, today: todayStr(), repFilter});
  const filtersEl = document.getElementById('ddFilters');
  if(ddTab === 'rx'){ filtersEl.innerHTML=''; renderRxStats(body, docs); return; }
  const dueN = docs.filter(d=>d.cadenceStatus==='due').length;
  const bdayN = docs.filter(d=>d.birthdayIn!=null && d.birthdayIn<=14).length;
  const rawOf = d => ((clinics.find(c=>c.id===d.clinicId)||{}).doctors||[]).find(x=>x.id===d.id) || {};
  const incN = docs.filter(d=>UMCore.doctorRecordCompleteness(rawOf(d)).pct<100).length;
  filtersEl.innerHTML = [
    ['all', `All (${docs.length})`], ['due', `${I('bell')} Follow-up due (${dueN})`],
    ['bday', `${I('cake')} Birthdays soon (${bdayN})`], ['rx', `${I('pill')} On prescriptions`],
    ['incomplete', `${I('pencil')} Incomplete cards (${incN})`],
  ].map(([k,l])=>`<div class="chip small ${ddFilter===k?'on':''}" onclick="ddFilter='${k}'; renderDoctorsDb();">${l}</div>`).join('');
  let list = docs;
  if(ddFilter==='due') list = list.filter(d=>d.cadenceStatus==='due');
  if(ddFilter==='bday') list = list.filter(d=>d.birthdayIn!=null && d.birthdayIn<=14);
  if(ddFilter==='rx') list = list.filter(d=>d.handovers.prescription>0);
  if(ddFilter==='incomplete') list = list.filter(d=>UMCore.doctorRecordCompleteness(rawOf(d)).pct<100);
  if(q) list = list.filter(d=>(d.name+' '+d.clinicName+' '+d.title).toLowerCase().includes(q));
  // overdue first, then upcoming birthdays, then by last visit
  list = [...list].sort((a,b)=>
    (b.cadenceStatus==='due') - (a.cadenceStatus==='due') ||
    ((a.birthdayIn!=null&&a.birthdayIn<=14)?0:1) - ((b.birthdayIn!=null&&b.birthdayIn<=14)?0:1) ||
    String(b.lastVisit||'').localeCompare(String(a.lastVisit||'')));
  const gaps = dataGaps().length;
  const totalFields = docs.length*7 + ddPool().filter(c=>c.cls!=='Closed').length*3;
  const pctDone = totalFields ? Math.max(0, Math.round((1 - dataGaps().reduce((s2,g)=>s2+g.miss.length,0)/totalFields)*100)) : 100;
  body.innerHTML = `
    <div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">
      ${currentUser.role==='supervisor'?`<button class="chip small" onclick="openContactImport()">${I('download')} Import contacts</button>`:''}
      <button class="chip small" onclick="openDoctorRecords()">${I('clipboard')} Doctor records</button>
      <button class="chip small" style="${gaps?'border-color:var(--gold); color:var(--amber-ink); font-weight:700;':''}" onclick="openDataEntry()">${I('pencil')} Complete data ${gaps?`(${gaps})`:'✓'}</button>
      <button class="chip small" onclick="exportDoctorsDbXlsx()">${I('share')} Export (Excel)</button>
      <span class="chip small" style="pointer-events:none;">Data completeness: ${pctDone}%</span>
    </div>
    ` + (list.map(d=>{
    const pb = SPECIALTY_PLAYBOOK[d.title];
    return `<div class="card clickable" style="margin-bottom:8px;" onclick="openDoctorProfile('${d.clinicId}','${d.id}')">
      <div class="row-between">
        <div style="min-width:0;">
          <div class="clinic-name">${pb?pb.icon+' ':''}${esc(d.name)}${d.title?` <span style="color:var(--muted); font-size:11.5px; font-weight:400;">${esc(d.title)}</span>`:''}</div>
          ${docBadges(rawOf(d))}
          <div class="clinic-sub">${esc(d.clinicName)}${currentUser.role==='supervisor'?' · '+esc(d.rep):''} · ${d.fieldVisits} visit${d.fieldVisits===1?'':'s'}${d.calls?` · ${d.calls} call${d.calls===1?'':'s'}`:''}${d.lastVisit?` · last ${fmtDate(d.lastVisit)}`:' · never visited'}</div>
        </div>
        <div style="text-align:start; flex-shrink:0; display:flex; flex-direction:column; gap:3px; align-items:flex-end;">
          ${d.cadenceStatus==='due'?`<span class="badge overdue">${I('bell')} ${d.overdueDays}d late</span>`:d.cadence?`<span class="badge upcoming">✓ ${esc(d.cadence)}</span>`:''}
          ${d.birthdayIn!=null && d.birthdayIn<=14?`<span class="badge today">${I('cake')} ${d.birthdayIn===0?'TODAY':'in '+d.birthdayIn+'d'}</span>`:''}
          ${d.handovers.rxMonth?`<span style="font-size:10.5px; color:var(--teal); font-weight:700;">💊 ${d.handovers.rxMonth} this month</span>`:''}
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty">👨‍⚕️ No doctors match. Doctors are added from each clinic\'s file or while logging a visit.</div>');
}
function renderRxStats(body, docs){
  const repFilter = currentUser.role==='supervisor' ? 'all' : currentUser.name;
  const g = UMCore.rxGrowth({clinics: ddPool(), visits, today: todayStr(), repFilter});
  const gTag = v => `<span style="font-weight:800; color:${v>0?'var(--sage-ink)':v<0?'var(--coral-ink)':'var(--muted)'};">${v>0?'▲':v<0?'▼':'•'} ${Math.abs(v)}%</span>`;
  body.innerHTML = `
    <div class="card" style="margin-bottom:10px;">
      <div style="font-weight:800; font-size:14px; margin-bottom:8px;">${I('pill')} Prescriptions distributed</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; text-align:center;">
        <div style="background:var(--paper); border-radius:10px; padding:10px;">
          <div style="font-size:20px; font-weight:800;">${g.totals.week}</div>
          <div style="font-size:10.5px; color:var(--muted);">THIS WEEK (last: ${g.totals.lastWeek})</div>
          <div style="font-size:12px;">${gTag(g.totals.weekGrowth)}</div>
        </div>
        <div style="background:var(--paper); border-radius:10px; padding:10px;">
          <div style="font-size:20px; font-weight:800;">${g.totals.month}</div>
          <div style="font-size:10.5px; color:var(--muted);">THIS MONTH (last: ${g.totals.lastMonth})</div>
          <div style="font-size:12px;">${gTag(g.totals.monthGrowth)}</div>
        </div>
      </div>
      <div style="color:var(--muted); font-size:11px; margin-top:6px;">Growth = هذا الأسبوع/الشهر مقابل الذي قبله — سجّلي كل بريسكريبشن من ملف الطبيب ليُحسب هنا.</div>
    </div>
    <div class="section-title"><span>${I('stethoscope')} By doctor</span></div>
    ${g.byDoctor.length?`<div class="card" style="padding:10px 12px;">${g.byDoctor.map(d=>`
      <div class="spec-row"><span class="k">${esc(d.name)} <span style="color:var(--muted); font-size:10.5px;">${esc(d.clinicName)}</span></span>
      <span class="v">W:<b>${d.week}</b> ${gTag(d.weekGrowth)} · M:<b>${d.month}</b> ${gTag(d.monthGrowth)}</span></div>`).join('')}</div>`
      :'<div class="empty">No prescriptions logged yet — open a doctor\'s profile and log the first one.</div>'}
    <div class="section-title"><span>${I('building')} By center</span></div>
    ${g.byClinic.length?`<div class="card" style="padding:10px 12px;">${g.byClinic.map(c=>`
      <div class="spec-row"><span class="k">${esc(c.name)} <span style="color:var(--muted); font-size:10.5px;">${c.doctors} doctor${c.doctors===1?'':'s'}</span></span>
      <span class="v">W:<b>${c.week}</b> ${gTag(c.weekGrowth)} · M:<b>${c.month}</b> ${gTag(c.monthGrowth)}</span></div>`).join('')}</div>`:''}
    ${g.byDoctor.length?`<button class="chip small" style="margin-top:10px;" onclick="exportRxXlsx()">${I('share')} Export prescriptions (Excel)</button>`:''}`;
}
// ---- CONTACTS BULK IMPORT: one sheet in, everything filed automatically ----
let _contactImport = null;
function openContactImport(){
  if(!requireAdmin()) return;
  showModal(`
    <h3 style="margin-top:0;">📥 Import all contacts at once</h3>
    <div style="color:var(--muted); font-size:12.5px; line-height:1.6; margin-bottom:10px;">
      Excel أو CSV بأعمدة مثل: <b>اسم الطبيب، العيادة، الهاتف، التخصص، تاريخ الميلاد، ملاحظات</b>
      (عربي أو إنجليزي — الترتيب لا يهم). النظام يوزّع كل طبيب على عيادته تلقائيًا،
      ينشئ العيادات الجديدة، يحدّث الموجودين بدل تكرارهم، ويحوّل التخصصات والتواريخ بنفسه.</div>
    <input type="file" accept=".csv,.txt,.xlsx,.xls" onchange="handleContactSheet(this)">
    <div id="ciPreview2" style="margin-top:10px;"></div>
  `);
}
async function handleContactSheet(input){
  const f = input.files && input.files[0];
  if(!f) return;
  const prev = document.getElementById('ciPreview2');
  prev.innerHTML = '<div style="color:var(--muted); font-size:13px;">Reading file…</div>';
  try{
    // Every sheet of the workbook is read; people are merged across sheets and
    // matched to clinics with the same matcher the ERP import uses.
    const sheets = /\.(xlsx|xls)$/i.test(f.name)
      ? await UMCore.readXlsx(await f.arrayBuffer())
      : [{ name: f.name, rows: UMCore.parseCsvText(await f.text()) }];
    const wb = UMCore.parseContactWorkbook(sheets, SPECIALTIES, { clinics });
    const repSheet = UMCore.parseClinicRepSheet(sheets, REPS);
    if(wb.error){ prev.innerHTML = '<div class="nudge">⚠️ لم أتعرف على الأعمدة — تأكد أن أحد الصفوف الأولى يحوي عناوين مثل "اسم الطبيب" أو "Hygienist" و"العيادة" و"رقم الهاتف".</div>'; return; }
    const norm = n => UMCore.normPerson(n);
    const plan = wb.contacts.map(ct => {
      let clinic = null, action;
      if(ct.clinic){
        const m = UMCore.matchClinicHint(ct.clinic, ct.area, clinics);
        clinic = m.clinicId ? clinics.find(c=>c.id===m.clinicId) : null;
      }
      if(clinic){
        const exist = (clinic.doctors||[]).find(d => norm(d.name)===norm(ct.name)
          || (ct.phone && d.phone && UMCore.phoneKey(d.phone) && UMCore.phoneKey(d.phone)===UMCore.phoneKey(ct.phone) && UMCore.samePerson(d.name, ct.name)));
        action = exist ? {type:'update', clinic, doc: exist} : {type:'add', clinic};
      } else if(ct.clinic){
        const key = UMCore.normClinicName(UMCore.normClinicHint(ct.clinic));
        action = {type:'newClinic', key, clinicName: UMCore.clinicDisplayName(ct.clinic), rep: repSheet.reps[key]||null, area: ct.area || repSheet.areas[key] || ''};
      } else {
        action = {type:'noClinic'};
      }
      return { ct, action };
    });
    _contactImport = { plan };
    const counts = { add:0, update:0, newClinic:0, noClinic:0 };
    plan.forEach(x=>counts[x.action.type]++);
    const newByKey = {};
    plan.filter(x=>x.action.type==='newClinic').forEach(x=>{ const k=x.action.key; (newByKey[k] = newByKey[k] || {name:x.action.clinicName, rep:x.action.rep, area:x.action.area, n:0}).n++; });
    const newList = Object.values(newByKey);
    const noClinic = plan.filter(x=>x.action.type==='noClinic');
    const readSheets = wb.perSheet.filter(s=>s.contacts);
    const icon = t => t==='add'?'➕':t==='update'?'🔄':t==='newClinic'?'🏥':'⚠️';
    prev.innerHTML = `
      <div style="color:var(--muted); font-size:12px; margin-bottom:6px;">قُرئت ${readSheets.length} ورقة: ${readSheets.map(s=>esc(s.sheet)+' ('+s.contacts+')').join(' · ')}${wb.duplicates?` — دُمج ${wb.duplicates} تكراراً`:''}</div>
      <div class="card" style="padding:10px 12px;">
        <div class="spec-row"><span class="k">👥 جهات اتصال فريدة</span><span class="v">${plan.length}</span></div>
        <div class="spec-row"><span class="k">➕ أشخاص جدد لعيادات موجودة</span><span class="v">${counts.add}</span></div>
        <div class="spec-row"><span class="k">🔄 تحديث أشخاص موجودين (بلا تكرار)</span><span class="v">${counts.update}</span></div>
        <div class="spec-row"><span class="k">🏥 عيادات جديدة ستُنشأ</span><span class="v">${newList.length}</span></div>
        ${counts.noClinic?`<div class="spec-row"><span class="k">⚠️ بدون اسم عيادة</span><span class="v">${counts.noClinic}</span></div>`:''}
      </div>
      ${newList.length?`<div style="font-size:12.5px; margin-top:8px;"><b>العيادات الجديدة:</b> ${newList.map(x=>esc(x.name)+' ('+x.n+(x.rep?' · '+esc(x.rep):'')+')').join(' · ')}</div>
      <label style="margin-top:8px;">مندوبة العيادات الجديدة التي لا يذكر الملف مندوبتها</label>
      <div class="chip-row" id="ciRep2">${REPS.map((r,i)=>`<div class="chip ${i===0?'on':''}" data-rep="${esc(r)}" onclick="pickModalRep(this)">${esc(r)}</div>`).join('')}</div>`:''}
      ${noClinic.length?`<div style="font-size:12.5px; margin-top:8px;"><b>بلا عيادة في الملف:</b> ${noClinic.map(x=>esc(x.ct.name)).join('، ')}</div>
      <label style="display:flex; gap:8px; align-items:center; margin-top:6px; font-size:12.5px;"><input type="checkbox" id="ciHold" style="width:auto;"> أضفهم إلى عيادة مؤقتة «Contacts without a clinic» لنقلهم لاحقاً</label>`:''}
      <div style="max-height:220px; overflow:auto; margin-top:8px; font-size:12px;">
        ${plan.map(x=>`<div style="padding:3px 0; border-bottom:1px dashed var(--line);">
          ${icon(x.action.type)} <b>${esc(x.ct.name)}</b>${x.ct.title?` · ${esc(x.ct.title)}`:''}
          → ${x.action.type==='newClinic'?esc(x.action.clinicName)+' (جديدة)':x.action.clinic?esc(x.action.clinic.name):'—'}
          ${x.ct.area?` · 📍${esc(x.ct.area)}`:''}${x.ct.phone?' · 📞':''}${x.ct.birthday?' · 🎂':''}</div>`).join('')}
      </div>
      <button class="btn" style="margin-top:10px;" onclick="commitContactImport()">✅ اعتماد الاستيراد</button>`;
  }catch(e){ console.error(e); prev.innerHTML = '<div class="nudge">⚠️ تعذّر قراءة الملف — جرّب حفظه كـ CSV.</div>'; }
}
async function commitContactImport(){
  if(!requireAdmin() || !_contactImport) return;
  const repEl = document.querySelector('#ciRep2 .chip.on');
  const newRep = repEl ? repEl.dataset.rep : (REPS[0]||'');
  const hold = !!(document.getElementById('ciHold') && document.getElementById('ciHold').checked);
  const HOLD_NAME = 'Contacts without a clinic';
  const newClinics = {}; // key -> clinic obj (created once, shared by its people)
  let added = 0, updated = 0, skippedN = 0, clinicsMade = 0;
  const holdClinic = () => {
    let c = clinics.find(x=>x.name===HOLD_NAME);
    if(!c){ c = normalizeClinic({id:uid(), name:HOLD_NAME, rep:newRep, cls:'D', notes:'People imported without a clinic name — move each to their clinic.', addedOn:todayStr()}); clinics.push(c); clinicsMade++; }
    return c;
  };
  _contactImport.plan.forEach(({ct, action})=>{
    let clinic = action.clinic;
    if(action.type==='noClinic'){ if(!hold){ skippedN++; return; } clinic = holdClinic(); }
    if(action.type==='newClinic'){
      clinic = newClinics[action.key];
      if(!clinic){
        clinic = normalizeClinic({id:uid(), name: action.clinicName, rep: action.rep || newRep, cls:'B', notes: action.area ? 'Area: '+action.area : '', addedOn:todayStr()});
        clinics.push(clinic); newClinics[action.key] = clinic; clinicsMade++;
      }
    }
    const doc = action.type==='update' ? action.doc : {id:uid(), name:ct.name, title:'', phone:'', birthday:'', cadence:'', notes:'', handovers:[]};
    // incoming non-empty values win; existing data never blanked
    if(ct.title) doc.title = ct.title; else if(ct.titleRaw && !doc.title) doc.notes = ((doc.notes||'')+' '+ct.titleRaw).trim();
    if(ct.phone) doc.phone = ct.phone;
    if(ct.birthday) doc.birthday = ct.birthday;
    const bits = [];
    if(ct.area) bits.push('Location: '+ct.area);
    if(ct.notes) ct.notes.split(' · ').forEach(n=>{ if(n) bits.push(n); });
    bits.forEach(n=>{ if(!(doc.notes||'').includes(n)) doc.notes = doc.notes ? doc.notes+' · '+n : n; });
    if(action.type!=='update'){ clinic.doctors.push(doc); added++; } else updated++;
  });
  _contactImport = null;
  await persist('clinics');
  closeModal();
  renderAll();
  if(document.getElementById('ddBody')) renderDoctorsDb();
  showToast(`✅ ${added} جهة اتصال جديدة · ${updated} تحديث${clinicsMade?` · ${clinicsMade} عيادة جديدة`:''}${skippedN?` · ${skippedN} بلا عيادة (لم تُستورد)`:''}`);
}

// ---- EASY DATA-ENTRY MODE: the girls complete missing data card by card ----
function dataGaps(){
  const pool = clinics.filter(c=>canViewClinic(c) && c.cls!=='Closed');
  const items = [];
  pool.forEach(c=>{
    const miss = [];
    if(!c.phone) miss.push('phone');
    if(!c.contact) miss.push('contact');
    if(!c.dealType) miss.push('dealType');
    if(miss.length) items.push({kind:'clinic', c, miss});
    (c.doctors||[]).forEach(d=>{
      const dm = [];
      if(!d.title) dm.push('title');
      if(!d.phone) dm.push('phone');
      if(!d.birthday) dm.push('birthday');
      if(!d.cadence) dm.push('cadence');
      if(!d.role) dm.push('role');
      if(!d.influence) dm.push('influence');
      if(!d.stage) dm.push('stage');
      if(dm.length) items.push({kind:'doctor', c, d, miss: dm});
    });
  });
  return items;
}
let _deQueue = [], _dePos = 0;
function openDataEntry(){
  _deQueue = dataGaps(); _dePos = 0;
  if(!_deQueue.length){ showModal(`<h3 style="margin-top:0;">🏆 البيانات مكتملة!</h3><p style="color:var(--muted); font-size:13px;">كل العيادات والأطباء لديك بياناتهم كاملة.</p><button class="btn" onclick="closeModal()">رائع</button>`); return; }
  renderDataEntryStep();
}
function renderDataEntryStep(){
  if(_dePos >= _deQueue.length){
    showModal(`<h3 style="margin-top:0;">🎉 انتهيت!</h3><p style="color:var(--muted); font-size:13px;">أكملتِ كل البيانات الناقصة في قائمتك.</p><button class="btn" onclick="closeModal(); renderDoctorsDb && renderDoctorsDb();">تم</button>`);
    return;
  }
  const it = _deQueue[_dePos];
  const prog = `<div style="height:5px; background:var(--paper); border-radius:3px; overflow:hidden; margin-bottom:10px;"><div style="width:${Math.round(_dePos/_deQueue.length*100)}%; height:100%; background:var(--teal);"></div></div>
    <div style="color:var(--muted); font-size:11px; margin-bottom:8px;">${_dePos+1} من ${_deQueue.length}</div>`;
  if(it.kind==='clinic'){
    showModal(`${prog}
      <h3 style="margin-top:0;">🏥 ${esc(it.c.name)}</h3>
      ${it.miss.includes('phone')?`<label>📞 هاتف العيادة</label><input type="text" id="deClinicPhone" placeholder="2XXXXXXX">`:''}
      ${it.miss.includes('contact')?`<label style="margin-top:6px;">📇 جهة الاتصال (استقبال/مسؤول)</label><input type="text" id="deClinicContact" placeholder="مثال: الاستقبال — أ. هدى">`:''}
      ${it.miss.includes('dealType')?`<label style="margin-top:6px;">🤝 طريقة التعامل</label>
        <div class="chip-row" id="deDeal"><div class="chip" data-v="prescription" data-deal="prescription" onclick="pickModalMulti(this)">💊 بريسكريبشن</div><div class="chip" data-v="direct" data-deal="direct" onclick="pickModalMulti(this)">🛒 بيع مباشر</div></div>`:''}
      <button class="btn" style="margin-top:12px;" onclick="saveDataEntryStep()">حفظ والتالي ←</button>
      <button class="btn secondary" style="margin-top:8px;" onclick="_dePos++; renderDataEntryStep();">تخطّي</button>`);
  } else {
    showModal(`${prog}
      <h3 style="margin-top:0;">👨‍⚕️ ${esc(it.d.name)} <span style="color:var(--muted); font-size:12px; font-weight:400;">${esc(it.c.name)}</span></h3>
      ${it.miss.includes('title')?`<label>التخصص</label><div class="chip-row" id="deTitle">${SPECIALTIES.map(t=>`<div class="chip small" data-v="${esc(t)}" onclick="pickModalCls(this)">${SPECIALTY_PLAYBOOK[t].icon} ${esc(t)}</div>`).join('')}</div>`:''}
      ${it.miss.includes('phone')?`<label style="margin-top:6px;">📞 هاتفه</label><input type="text" id="deDocPhone" placeholder="9XXXXXXX">`:''}
      ${it.miss.includes('birthday')?`<label style="margin-top:6px;">🎂 تاريخ ميلاده</label><input type="date" id="deDocBday">`:''}
      ${it.miss.includes('role')?`<label style="margin-top:6px;">🏷️ دوره في العيادة</label><div class="chip-row" id="deRole">${UMCore.DOC_ROLES.map(([k,l])=>`<div class="chip small" data-v="${k}" onclick="pickModalCls(this)">${esc(l)}</div>`).join('')}</div>`:''}
      ${it.miss.includes('influence')?`<label style="margin-top:6px;">👑 قوة قراره في الشراء</label><div class="chip-row" id="deInfl">${UMCore.DOC_INFLUENCE.map(([k,l])=>`<div class="chip small" data-v="${k}" onclick="pickModalCls(this)">${esc(l)}</div>`).join('')}</div>`:''}
      ${it.miss.includes('stage')?`<label style="margin-top:6px;">🤝 مرحلة العلاقة</label><div class="chip-row" id="deStage">${UMCore.DOC_STAGES.map(([k,l])=>`<div class="chip small" data-v="${k}" onclick="pickModalCls(this)">${esc(l)}</div>`).join('')}</div>`:''}
      ${it.miss.includes('cadence')?`<label style="margin-top:6px;">📆 إيقاع زيارته</label>
        <div class="chip-row" id="deCad"><div class="chip small" data-v="weekly" onclick="pickModalCls(this)">أسبوعي</div><div class="chip small" data-v="monthly" onclick="pickModalCls(this)">شهري</div><div class="chip small" data-v="quarterly" onclick="pickModalCls(this)">ربع سنوي</div></div>`:''}
      <button class="btn" style="margin-top:12px;" onclick="saveDataEntryStep()">حفظ والتالي ←</button>
      <button class="btn secondary" style="margin-top:8px;" onclick="_dePos++; renderDataEntryStep();">تخطّي</button>`);
  }
}
async function saveDataEntryStep(){
  const it = _deQueue[_dePos];
  const val = id => (document.getElementById(id)||{}).value || '';
  const chip = id => { const el = document.querySelector('#'+id+' .chip.on'); return el ? el.dataset.v : ''; };
  let changed = false;
  if(it.kind==='clinic'){
    if(val('deClinicPhone')){ it.c.phone = val('deClinicPhone').trim(); changed=true; }
    if(val('deClinicContact')){ it.c.contact = val('deClinicContact').trim(); changed=true; }
    const deal = dealFromChips('#deDeal');
    if(deal){ it.c.dealType = deal; changed=true; }
  } else {
    if(chip('deTitle')){ it.d.title = chip('deTitle'); changed=true; }
    if(val('deDocPhone')){ it.d.phone = val('deDocPhone').trim(); changed=true; }
    if(val('deDocBday')){ it.d.birthday = val('deDocBday'); changed=true; }
    if(chip('deCad')){ it.d.cadence = chip('deCad'); changed=true; }
    if(chip('deRole')){ it.d.role = chip('deRole'); changed=true; }
    if(chip('deInfl')){ it.d.influence = chip('deInfl'); changed=true; }
    if(chip('deStage')){ it.d.stage = chip('deStage'); changed=true; }
  }
  if(changed) await persist('clinics');
  _dePos++;
  renderDataEntryStep();
}
// ---- DOCTOR RECORDS: the fill-in section and the per-doctor card ----
let _drRep = 'all', _drOpenClinic = null, _drBack = null;
function drPool(){
  let pool = clinics.filter(c=>canViewClinic(c) && c.cls!=='Closed');
  if(currentUser.role==='supervisor' && _drRep!=='all') pool = pool.filter(c=>c.rep===_drRep);
  return pool;
}
function drClinicPct(c){
  const ds = c.doctors||[];
  return ds.length ? Math.round(ds.reduce((t,d)=>t+UMCore.doctorRecordCompleteness(d).pct,0)/ds.length) : 0;
}
function openDoctorRecords(clinicId){
  if(clinicId) _drOpenClinic = clinicId;
  const pool = drPool();
  const allDocs = pool.flatMap(c=>c.doctors||[]);
  const complete = allDocs.filter(d=>UMCore.doctorRecordCompleteness(d).pct===100).length;
  const avg = allDocs.length ? Math.round(allDocs.reduce((t,d)=>t+UMCore.doctorRecordCompleteness(d).pct,0)/allDocs.length) : 0;
  window._drSorted = pool.slice().sort((a,b)=>drClinicPct(a)-drClinicPct(b) || a.name.localeCompare(b.name));
  showModal(`
    <h3 style="margin-top:0;">${I('clipboard')} Doctor records</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">One card per doctor: who they are, what they decide, where the relationship stands. The coach turns the cards into next steps for every clinic.</p>
    ${currentUser.role==='supervisor'?`<div class="chip-row" style="margin-bottom:8px;">${['all',...REPS].map(r=>`<div class="chip small ${_drRep===r?'on':''}" onclick="_drRep='${r}'; openDoctorRecords();">${r==='all'?'All':esc(r)}</div>`).join('')}</div>`:''}
    <div class="card" style="padding:12px; margin-bottom:12px;">
      <div class="row-between"><strong>${complete} of ${allDocs.length} cards complete</strong><span style="color:var(--muted); font-size:12.5px;">${avg}%</span></div>
      <div class="bar-track" style="height:8px; margin-top:6px;"><div class="bar-fill" style="width:${avg}%;"></div></div>
    </div>
    <input type="text" id="drSearch" placeholder="Search clinics or doctors..." oninput="renderDrList()" style="margin-bottom:10px;">
    <div id="drList"></div>
  `);
  renderDrList();
}
function renderDrList(){
  const q = ((document.getElementById('drSearch')||{}).value||'').trim().toLowerCase();
  const el = document.getElementById('drList'); if(!el) return;
  const list = (window._drSorted||[]).filter(c=>!q || c.name.toLowerCase().includes(q) || (c.doctors||[]).some(d=>d.name.toLowerCase().includes(q)));
  el.innerHTML = list.map(c=>{
    const open = _drOpenClinic===c.id || (q && (c.doctors||[]).some(d=>d.name.toLowerCase().includes(q)));
    const pct = drClinicPct(c), n = (c.doctors||[]).length;
    return `<div class="card" style="margin-bottom:8px; padding:12px 14px;">
      <div class="row-between clickable" onclick="_drOpenClinic = _drOpenClinic==='${c.id}' ? null : '${c.id}'; renderDrList();">
        <div><div class="clinic-name">${esc(c.name)}</div><div class="clinic-sub">${currentUser.role==='supervisor'?esc(c.rep||'')+' · ':''}${n} doctor${n===1?'':'s'}${n?` · ${pct}% complete`:''}</div></div>
        <span style="color:var(--muted);">${open?'▾':'›'}</span>
      </div>
      ${open?`<div style="margin-top:10px; border-top:1px solid var(--line); padding-top:8px;">
        ${(c.doctors||[]).map(d=>{ const comp=UMCore.doctorRecordCompleteness(d); const pb=SPECIALTY_PLAYBOOK[d.title];
          return `<div class="doc-row row-between clickable" onclick="_drBack='records'; openDoctorRecord('${c.id}','${d.id}')">
            <div><div class="dname">${pb?pb.icon+' ':''}${esc(d.name)}${d.title?` <span style="color:var(--muted); font-size:11.5px; font-weight:400;">${esc(d.title)}</span>`:''}</div>${docBadges(d)}</div>
            <span class="badge ${comp.pct===100?'upcoming':'overdue'}">${comp.pct===100?'✓ complete':comp.pct+'%'}</span>
          </div>`; }).join('') || '<div style="color:var(--muted); font-size:12.5px;">No doctors recorded yet.</div>'}
        <div style="display:flex; gap:6px; margin-top:8px;">
          <input type="text" id="drNew-${c.id}" dir="auto" placeholder="Doctor name" style="flex:1; margin:0;">
          <button class="chip small" onclick="addDoctorFromRecords('${c.id}')">+ Add</button>
        </div>
      </div>`:''}
    </div>`;
  }).join('') || '<div class="empty">No clinics match.</div>';
}
async function addDoctorFromRecords(clinicId){
  const inp = document.getElementById('drNew-'+clinicId);
  const name = ((inp&&inp.value)||'').trim();
  if(!name){ showToast('Enter a doctor name'); return; }
  const c = clinics.find(x=>x.id===clinicId);
  if(!c || !canViewClinic(c)){ showToast('🔒 Not your clinic'); return; }
  const r = addDoctorsToClinic(c, name, '');
  if(!r.ids.length){ showToast('Enter a doctor name'); return; }
  if(r.added) await persist('clinics');
  if(r.reused && !r.added) showToast('👤 Already on the list — opening the existing record');
  _drBack = 'records';
  openDoctorRecord(clinicId, r.ids[0]);
}
function openDoctorRecord(clinicId, docId){
  const { c, d } = _docRow(clinicId, docId);
  if(!c || !d) return;
  if(!canViewClinic(c)){ showToast('🔒 Not your clinic'); return; }
  const chips = (id, list, cur) => `<div class="chip-row" id="${id}">${list.map(([k,l])=>`<div class="chip small ${cur===k?'on':''}" data-v="${k}" onclick="pickModalCls(this)">${esc(l)}</div>`).join('')}</div>`;
  const comp = UMCore.doctorRecordCompleteness(d);
  showModal(`
    <h3 style="margin-top:0;">${I('pencil')} Doctor card</h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-6px;">${esc(c.name)} · ${comp.pct}% complete</p>
    <label>Name</label>
    <input type="text" id="drName" dir="auto" value="${esc(d.name||'')}">
    <label>Specialty</label>
    <div class="chip-row" id="drTitle">${SPECIALTIES.map(t=>`<div class="chip small ${d.title===t?'on':''}" data-v="${esc(t)}" onclick="pickModalCls(this)">${SPECIALTY_PLAYBOOK[t].icon} ${esc(t)}</div>`).join('')}</div>
    <label>Role in the clinic</label>
    ${chips('drRole', UMCore.DOC_ROLES, d.role)}
    <label>Decision influence</label>
    ${chips('drInfluence', UMCore.DOC_INFLUENCE, d.influence)}
    <label>Relationship stage</label>
    ${chips('drStage', UMCore.DOC_STAGES, d.stage)}
    <div style="display:flex; gap:8px;">
      <div style="flex:1;"><label>Mobile</label><input type="tel" id="drPhone" value="${esc(d.phone||'')}" placeholder="9XXXXXXX"></div>
      <div style="flex:1;"><label>WhatsApp</label><input type="tel" id="drWhatsapp" value="${esc(d.whatsapp||'')}" placeholder="if different"></div>
    </div>
    <label>Email</label>
    <input type="email" id="drEmail" value="${esc(d.email||'')}" placeholder="optional">
    <div style="display:flex; gap:8px;">
      <div style="flex:1;"><label>Birthday</label><input type="date" id="drBirthday" value="${esc(d.birthday||'')}"></div>
      <div style="flex:1;"><label>Best time to visit</label><input type="text" id="drBestTime" dir="auto" value="${esc(d.bestTime||'')}" placeholder="e.g. Tue–Thu after 4pm"></div>
    </div>
    <label>Visit rhythm</label>
    ${chips('drCadence', [['weekly','Weekly'],['monthly','Monthly'],['quarterly','Quarterly'],['','None']], d.cadence||'')}
    <label>Interests / what they care about</label>
    <input type="text" id="drInterests" dir="auto" value="${esc(d.interests||'')}" placeholder="e.g. whitening, implants, kids">
    <label>Competitor products used</label>
    <input type="text" id="drCompetitor" dir="auto" value="${esc(d.competitor||'')}" placeholder="e.g. Oral-B, Colgate">
    <label>Next step</label>
    <input type="text" id="drNextStep" dir="auto" value="${esc(d.nextStep||'')}" placeholder="e.g. bring the Sonicare demo on the next visit">
    <label>Notes</label>
    <textarea id="drNotes" dir="auto" style="min-height:60px;">${esc(d.notes||'')}</textarea>
    <button class="btn" onclick="saveDoctorRecord('${clinicId}','${docId}')">Save card</button>
    <button class="btn secondary" onclick="closeModal(); openDoctorProfile('${clinicId}','${docId}')">Open profile & history</button>
  `);
}
async function saveDoctorRecord(clinicId, docId){
  const { c, d } = _docRow(clinicId, docId);
  if(!c || !d || !canViewClinic(c)) return;
  const val = id => ((document.getElementById(id)||{}).value||'').trim();
  const chip = id => { const el = document.querySelector('#'+id+' .chip.on'); return el ? el.dataset.v : ''; };
  const name = val('drName');
  if(!name){ showToast('Enter a doctor name'); return; }
  Object.assign(d, { name, title: chip('drTitle'), role: chip('drRole'), influence: chip('drInfluence'), stage: chip('drStage'),
    phone: val('drPhone'), whatsapp: val('drWhatsapp'), email: val('drEmail'), birthday: val('drBirthday'), cadence: chip('drCadence'),
    bestTime: val('drBestTime'), interests: val('drInterests'), competitor: val('drCompetitor'), nextStep: val('drNextStep'), notes: val('drNotes') });
  await persist('clinics');
  const comp = UMCore.doctorRecordCompleteness(d);
  showToast(comp.pct===100 ? '✅ Card complete — the coach now knows who decides' : `💾 Saved · ${comp.pct}% complete`);
  const back = _drBack; _drBack = null;
  if(back==='records') openDoctorRecords(clinicId);
  else { closeModal(); if(document.getElementById('ddBody')) renderDoctorsDb(); }
  renderToday();
}
// The clinic's decision map — who decides, what we don't know yet, what to do next.
function decisionMapBlock(c){
  const analytics = UMCore.doctorAnalytics({clinics:[c], visits, today: todayStr(), repFilter:'all'});
  const m = UMCore.clinicDecisionMap(c, {today: todayStr(), analytics});
  const who = (label, arr) => arr.length ? `<div style="font-size:12.5px; padding:2px 0;"><span style="color:var(--muted);">${label}:</span> ${arr.map(d=>esc(d.name)).join(', ')}</div>` : '';
  return `<div class="section-title" style="margin-top:20px;">🧭 Decision map</div>
    <div class="card" style="padding:12px 14px; border-inline-start:4px solid var(--purple);">
      ${who('Decision maker', m.deciders)}${who('Influencers', m.influencers)}${who('Champions', m.champions)}${who('Blocked', m.blocked)}
      ${m.gaps.length?`<div style="margin-top:6px; font-size:12px; font-weight:700; color:var(--amber-ink);">Gaps in what we know</div>${m.gaps.map(g=>`<div style="font-size:12.5px; padding:2px 0;">• ${esc(g)}</div>`).join('')}`:''}
      ${m.steps.length?`<div style="margin-top:6px; font-size:12px; font-weight:700; color:var(--teal);">Next steps</div>${m.steps.map(x=>`<div style="font-size:12.5px; padding:2px 0;">→ ${esc(x)}</div>`).join('')}`:''}
      ${canViewClinic(c)?`<button class="chip small" style="margin-top:8px;" onclick="_drBack=null; openDoctorRecords('${c.id}')">${I('pencil')} Fill the doctor cards</button>`:''}
    </div>`;
}
// Today: a nudge while cards are incomplete or a clinic has no known decision maker.
function renderDocCardsNudge(){
  const el = document.getElementById('docCardsNudge'); if(!el) return;
  const pool = clinics.filter(c=>canViewClinic(c) && c.cls!=='Closed');
  const docs = pool.flatMap(c=>c.doctors||[]);
  const inc = docs.filter(d=>UMCore.doctorRecordCompleteness(d).pct<100).length;
  const noDecider = pool.filter(c=>(c.doctors||[]).length && !(c.doctors||[]).some(d=>d.influence==='decider')).length;
  if(!inc && !noDecider){ el.innerHTML=''; return; }
  el.innerHTML = `<div class="card clickable" style="border-inline-start:4px solid var(--purple); margin-bottom:6px;" onclick="openDoctorRecords()">
    <div style="font-weight:700; font-size:13.5px;">🧭 Doctor cards</div>
    <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:3px;">${inc} card${inc===1?'':'s'} to complete · ${noDecider} clinic${noDecider===1?'':'s'} with no known decision maker. Tap to fill them in.</div>
  </div>`;
}
// ---- DOCTOR PROFILE: the per-contact analysis + pull report ----
function _docRow(clinicId, docId){
  const c = clinics.find(x=>x.id===clinicId);
  const d = c && (c.doctors||[]).find(x=>x.id===docId);
  return { c, d };
}
// What to do next for this doctor — concrete, from the data.
function doctorNextActions(da, c){
  const acts = [];
  const d = ((c&&c.doctors)||[]).find(x=>x.id===da.id) || {};
  if(!d.role || !d.influence || !d.stage) acts.push('🧭 أكملي كارت الطبيب (دوره في العيادة، قوة قراره، مرحلة العلاقة) — بعدها يظهر التوجيه المناسب له');
  const STAGE_STEP = {new:'👋 لم تقابليه بعد — اطلبي من الاستقبال موعداً قصيراً للتعارف', met:'🧪 زيارة ثانية خلال أسبوعين مع عينات لتثبيت العلاقة', warm:'🛒 العلاقة جاهزة — اطلبي طلبية تجريبية أو وصفة', champion:'🤝 اطلبي منه تعريفك بصاحب القرار أو بالأطباء الآخرين، أو توصية لعيادة أخرى', blocked:'🚧 لا تضغطي عليه — اعملي عبر شخص آخر في العيادة (مؤثر أو أخصائي)'};
  if(STAGE_STEP[d.stage]) acts.push(STAGE_STEP[d.stage]);
  if(d.influence==='decider' && da.lastVisit && daysBetween(da.lastVisit, todayStr())>=45) acts.push(`👑 صاحب القرار — لم يُزر منذ ${daysBetween(da.lastVisit, todayStr())} يوماً؛ ضعيه في خطة الأسبوع`);
  if(d.influence==='decider' && !da.lastVisit) acts.push('👑 صاحب القرار ولم تُسجَّل معه أي زيارة — ابدئي به');
  if(d.nextStep) acts.push('📌 الخطوة التالية المسجلة: ' + d.nextStep);
  if(da.cadenceStatus==='due') acts.push(`⏰ زيارة مستحقة — متأخرة ${da.overdueDays} يوم عن إيقاع "${da.cadence}"`);
  if(da.birthdayIn!=null && da.birthdayIn<=14) acts.push(`🎂 عيد ميلاده ${da.birthdayIn===0?'اليوم!':'بعد '+da.birthdayIn+' يوم'} — جهّزي تهنئة أو هدية مناسبة`);
  if(clinicIsRx(c) && da.handovers.rxMonth===0) acts.push('💊 لم يستلم أي بريسكريبشن هذا الشهر — عيادته تعمل بنظام الوصفات');
  if(!da.cadence) acts.push('📆 حددي إيقاع متابعة (أسبوعي/شهري/ربع سنوي) ليتابعه النظام تلقائيًا');
  const lastV = da.visitLog[0];
  if(lastV && lastV.noOrderReason) acts.push(`📝 آخر زيارة بلا طلب — السبب: "${lastV.noOrderReason}" — عالجيه في الزيارة القادمة`);
  if(!acts.length) acts.push('✅ كل شيء منتظم — حافظي على الإيقاع الحالي');
  return acts;
}
function openDoctorProfile(clinicId, docId){
  const { c, d } = _docRow(clinicId, docId);
  if(!c || !d) return;
  const repFilter = currentUser.role==='supervisor' ? 'all' : currentUser.name;
  const da = UMCore.doctorAnalytics({clinics:[c], visits, today: todayStr(), repFilter:'all'}).find(x=>x.id===docId);
  const canEdit = canViewClinic(c);
  const led = clinicErpLedger(clinicId);
  const clinicMtd = (erpMtdMap && caMonthClinicSales) ? (caMonthClinicSales()[clinicId]||{net:0}) : {net:0};
  const acts = doctorNextActions(da, c);
  const KINDS = {prescription:'💊 Prescription', sample:'🧪 Sample', gift:'🎁 Gift', other:'📦 Other'};
  const pb = SPECIALTY_PLAYBOOK[d.title];
  showModal(`
    <div class="row-between" style="align-items:flex-start;">
      <h3 style="margin:0;">${pb?pb.icon+' ':''}${esc(d.name)}</h3>
      <div style="display:flex; gap:4px;">${canEdit?`<button class="chip small" onclick="_drBack=null; openDoctorRecord('${clinicId}','${docId}')">${I('pencil')} Edit card</button>`:''}<button class="chip small" onclick="exportDoctorReportXlsx('${clinicId}','${docId}')">📄 تقرير مفصل</button></div>
    </div>
    ${docBadges(d)}
    <p style="color:var(--muted); font-size:12.5px; margin:2px 0 10px;">${esc(d.title||'—')} · <a onclick="closeModal(); openClinicDetail('${clinicId}')" style="text-decoration:underline; cursor:pointer;">${esc(c.name)}</a>${currentUser.role==='supervisor'?' · '+esc(c.rep):''}${d.phone?` · <a href="tel:${esc(d.phone)}">📞 ${esc(d.phone)}</a>`:''}</p>

    <div class="section-title" style="margin-top:0;">🎯 ما يجب عمله</div>
    <div class="card" style="border-inline-start:4px solid var(--teal);">${acts.map(a=>`<div style="font-size:12.5px; padding:3px 0;">${esc(a)}</div>`).join('')}</div>

    <div class="section-title">📊 الأرقام</div>
    <div class="card" style="padding:10px 12px;">
      <div class="spec-row"><span class="k">زيارات ميدانية / مكالمات</span><span class="v">${da.fieldVisits} / ${da.calls}${da.lastVisit?` · آخرها ${fmtDate(da.lastVisit)}`:''}</span></div>
      <div class="spec-row"><span class="k">💊 بريسكريبشن (هذا الشهر / الإجمالي)</span><span class="v">${da.handovers.rxMonth} / ${da.handovers.prescription}</span></div>
      <div class="spec-row"><span class="k">🧪 عينات · 🎁 هدايا</span><span class="v">${da.handovers.sample} · ${da.handovers.gift}</span></div>
      <div class="spec-row"><span class="k">🏥 مبيعات عيادته هذا الشهر (ERP)</span><span class="v">${money(clinicMtd.net||0)}</span></div>
      ${led.foc.length?`<div class="spec-row"><span class="k">مجاني/عينات لعيادته (من الفواتير)</span><span class="v">${led.foc.length} سطر</span></div>`:''}
    </div>

    ${canEdit?`<div class="section-title">👤 الملف</div>
    <div class="card" style="padding:12px;">
      <label>👨‍⚕️ الاسم (لتصحيحه)</label>
      <div style="display:flex; gap:6px;">
        <input type="text" value="${esc(d.name||'')}" style="flex:1; margin:0;">
        <button class="chip small" onclick="saveDoctorField('${clinicId}','${docId}','name',this.previousElementSibling.value); openDoctorProfile('${clinicId}','${docId}');">💾 Save</button>
      </div>
      <label style="margin-top:8px;">🎂 تاريخ الميلاد</label>
      <input type="date" value="${esc(d.birthday||'')}" onchange="saveDoctorField('${clinicId}','${docId}','birthday',this.value)">
      <label style="margin-top:8px;">📞 الهاتف</label>
      <input type="text" value="${esc(d.phone||'')}" placeholder="9XXXXXXX" onchange="saveDoctorField('${clinicId}','${docId}','phone',this.value)">
      <label style="margin-top:8px;">📆 إيقاع المتابعة</label>
      <div class="chip-row">${[['weekly','أسبوعي'],['monthly','شهري'],['quarterly','ربع سنوي'],['','بدون']].map(([k,l])=>`<div class="chip small ${(d.cadence||'')===k?'on':''}" onclick="saveDoctorField('${clinicId}','${docId}','cadence','${k}'); openDoctorProfile('${clinicId}','${docId}');">${l}</div>`).join('')}</div>
      <label style="margin-top:8px;">📝 تقرير عنه (اهتماماته، شخصيته، ملاحظات)</label>
      <textarea style="min-height:60px;" onchange="saveDoctorField('${clinicId}','${docId}','notes',this.value)">${esc(d.notes||'')}</textarea>
    </div>`:''}

    <div class="section-title">🎁 التسليمات (${(d.handovers||[]).length})</div>
    ${canEdit?`<div class="card" style="padding:12px; margin-bottom:8px;">
      <div class="chip-row" id="hoKind">${Object.entries(KINDS).map(([k,l],i)=>`<div class="chip small ${i===0?'on':''}" data-kind="${k}" onclick="pickModalCls(this)">${l}</div>`).join('')}</div>
      <div style="display:flex; gap:6px; margin-top:8px;">
        <input type="text" id="hoWhat" placeholder="ماذا سُلِّم؟" style="flex:2;">
        <input type="number" id="hoQty" placeholder="عدد" min="1" value="1" style="flex:0.6;">
        <input type="date" id="hoDate" value="${todayStr()}" max="${todayStr()}" style="flex:1.1;">
      </div>
      <button class="btn small" style="margin-top:8px;" onclick="addHandover('${clinicId}','${docId}')">➕ سجّل التسليم</button>
    </div>`:''}
    ${(d.handovers||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,15).map(h=>`
      <div class="visit-hist" style="border-inline-start:3px solid ${h.kind==='prescription'?'var(--teal)':h.kind==='gift'?'var(--gold)':'var(--sage)'}; padding-inline-start:10px;">
        <strong>${fmtDate(h.date)}</strong> · ${KINDS[h.kind]||h.kind} · ${esc(h.what||'')}${h.qty>1?` ×${h.qty}`:''}
        <span style="color:var(--muted); font-size:11px;"> — ${esc(h.by||'')}</span>
        ${canEdit?`<button class="del" style="float:left;" onclick="removeHandover('${clinicId}','${docId}','${h.id}')">&times;</button>`:''}
      </div>`).join('') || '<div style="color:var(--muted); font-size:12.5px;">لا تسليمات مسجلة بعد.</div>'}

    <div class="section-title">🗓️ سجل الزيارات (${da.visitLog.length})</div>
    ${da.visitLog.slice(0,10).map(v=>`
      <div class="visit-hist"><strong>${fmtDate(v.date)}</strong> · ${esc(v.rep)}${v.callOnly?' · '+(CHANNEL_LABELS[v.channel]||'📞'):''}${v.orderTaken?' · 🛒 '+money(v.orderTotal):''}
      ${v.notes?`<div style="color:var(--muted); font-size:12px;">${esc(v.notes.slice(0,120))}</div>`:''}
      ${v.noOrderReason?`<div style="color:var(--coral-ink); font-size:11.5px;">بلا طلب: ${esc(v.noOrderReason.slice(0,80))}</div>`:''}</div>`).join('')
      || '<div style="color:var(--muted); font-size:12.5px;">لم تُسجَّل زيارات له بعد — اختاريه عند تسجيل الزيارة القادمة.</div>'}
    ${da.visitLog.length>10?`<div style="color:var(--muted); font-size:11.5px; text-align:center;">+${da.visitLog.length-10} في التقرير المفصل</div>`:''}
    <button class="btn secondary" style="margin-top:12px;" onclick="closeModal()">إغلاق</button>
  `);
}
async function saveDoctorField(clinicId, docId, field, value){
  const { c, d } = _docRow(clinicId, docId);
  if(!c || !d || !canViewClinic(c)) return;
  if(field === 'name'){
    value = (value||'').trim();
    if(!value){ showToast('الاسم لا يمكن أن يكون فارغًا'); return; }
  }
  d[field] = value;
  await persist('clinics');
  showToast('✅ حُفظ');
  if(document.getElementById('ddBody')) renderDoctorsDb();
}
async function addHandover(clinicId, docId){
  const { c, d } = _docRow(clinicId, docId);
  if(!c || !d || !canViewClinic(c)) return;
  const kindEl = document.querySelector('#hoKind .chip.on');
  const what = (document.getElementById('hoWhat').value||'').trim();
  const qty = Math.max(1, parseInt(document.getElementById('hoQty').value,10)||1);
  const date = document.getElementById('hoDate').value || todayStr();
  if(!what){ showToast('اكتبي ماذا سُلِّم'); return; }
  d.handovers = d.handovers || [];
  d.handovers.push({id:uid(), date, kind: kindEl?kindEl.dataset.kind:'other', what, qty, by: currentUser.name});
  await persist('clinics');
  showToast('🎁 سُجِّل التسليم');
  openDoctorProfile(clinicId, docId);
}
async function removeHandover(clinicId, docId, hid){
  const { c, d } = _docRow(clinicId, docId);
  if(!c || !d || !canViewClinic(c)) return;
  d.handovers = (d.handovers||[]).filter(h=>h.id!==hid);
  await persist('clinics');
  openDoctorProfile(clinicId, docId);
}
// The detailed pull report: profile + numbers + every visit + every handover
// + the clinic's invoice/FOC sync — one Excel file per doctor.
function exportDoctorReportXlsx(clinicId, docId){
  const { c, d } = _docRow(clinicId, docId);
  if(!c || !d) return;
  const da = UMCore.doctorAnalytics({clinics:[c], visits, today: todayStr(), repFilter:'all'}).find(x=>x.id===docId);
  const led = clinicErpLedger(clinicId);
  const clinicMtd = caMonthClinicSales()[clinicId]||{net:0};
  const rows = [
    ['UltraMed — Doctor Report', d.name],
    ['Specialty', d.title||''], ['Clinic', c.name], ['Rep', c.rep||''],
    ['Phone', d.phone||''], ['Birthday', d.birthday||''], ['Follow-up rhythm', d.cadence||'—'],
    ['Field visits', da.fieldVisits], ['Calls', da.calls], ['Last visit', da.lastVisit||'—'],
    ['Prescriptions (total)', da.handovers.prescription], ['Prescriptions (this month)', da.handovers.rxMonth],
    ['Samples', da.handovers.sample], ['Gifts', da.handovers.gift],
    ['Clinic ERP sales this month (KD)', Math.round((clinicMtd.net||0)*100)/100],
    ['Notes', d.notes||''],
    [''],
    ['— VISIT HISTORY —'],
    ['Date','Rep','Type','Order (KD)','Notes','No-order reason'],
    ...da.visitLog.map(v=>[v.date, v.rep, v.callOnly?('Call: '+(v.channel||'')):'Field visit', v.orderTaken?(v.orderTotal||0):'', v.notes||'', v.noOrderReason||'']),
    [''],
    ['— HANDOVERS (prescriptions / samples / gifts) —'],
    ['Date','Kind','What','Qty','By'],
    ...(d.handovers||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).map(h=>[h.date, h.kind, h.what||'', h.qty||1, h.by||'']),
    [''],
    ['— CLINIC INVOICE SYNC (returns & free goods for '+c.name+') —'],
    ['Date','Doc','Type','Product','Qty','Value (KD)'],
    ...led.ret.map(r=>[r.date, r.doc, isExchangeLine(r)?'Exchange':'Return', r.product||r.brand||'', r.qty||'', -r.retAmount]),
    ...led.foc.map(r=>[r.date, r.doc, r.kind==='deal'?'Deal bonus':'Sample/FOC', r.product||r.brand||'', r.qty||'', 0]),
  ];
  downloadXlsx('UltraMed-Doctor-'+(d.name||'report').replace(/[^\w\u0600-\u06FF-]+/g,'_')+'.xlsx', rows, 'Doctor');
  showToast('📄 التقرير المفصل ينزل الآن');
}
function exportDoctorsDbXlsx(){
  const repFilter = currentUser.role==='supervisor' ? 'all' : currentUser.name;
  const docs = UMCore.doctorAnalytics({clinics: ddPool(), visits, today: todayStr(), repFilter});
  const rawOf = d => ((clinics.find(c=>c.id===d.clinicId)||{}).doctors||[]).find(x=>x.id===d.id) || {};
  const rows = [['Doctor','Specialty','Clinic','Rep','Role','Influence','Stage','Phone','WhatsApp','Email','Birthday','Best time','Interests','Competitor','Next step','Rhythm','Status','Field visits','Calls','Last visit','Rx month','Rx total','Samples','Gifts','Notes'],
    ...docs.map(d=>{ const r=rawOf(d); return [d.name, d.title, d.clinicName, d.rep, DOC_ROLE_LABEL[r.role]||'', DOC_INFLUENCE_LABEL[r.influence]||'', DOC_STAGE_LABEL[r.stage]||'', d.phone, r.whatsapp||'', r.email||'', d.birthday, r.bestTime||'', r.interests||'', r.competitor||'', r.nextStep||'', d.cadence||'', d.cadenceStatus==='due'?('OVERDUE '+d.overdueDays+'d'):d.cadenceStatus, d.fieldVisits, d.calls, d.lastVisit||'', d.handovers.rxMonth, d.handovers.prescription, d.handovers.sample, d.handovers.gift, d.notes]; })];
  downloadXlsx('ultramed-doctors-database.xlsx', rows, 'Doctors');
}
function exportRxXlsx(){
  const repFilter = currentUser.role==='supervisor' ? 'all' : currentUser.name;
  const g = UMCore.rxGrowth({clinics: ddPool(), visits, today: todayStr(), repFilter});
  const rows = [['Doctor','Clinic','Rep','This week','Last week','Week growth %','This month','Last month','Month growth %','Total'],
    ...g.byDoctor.map(d=>[d.name, d.clinicName, d.rep, d.week, d.lastWeek, d.weekGrowth, d.month, d.lastMonth, d.monthGrowth, d.total]),
    [''],
    ['Center','','Doctors','This week','Last week','Week growth %','This month','Last month','Month growth %','Total'],
    ...g.byClinic.map(c=>[c.name, '', c.doctors, c.week, c.lastWeek, c.weekGrowth, c.month, c.lastMonth, c.monthGrowth, c.total])];
  downloadXlsx('ultramed-prescriptions-growth.xlsx', rows, 'Prescriptions');
}
// ---- CLINIC SALES ANALYSIS ----
// One screen answering: which clinic carries how much of the monthly target,
// what has it actually bought (family-unified ERP), and what exactly to sell
// there next — ranked by the biggest open gap.
let caRep = null;
// All uploaded rows grouped by the clinic they matched — computed in ONE pass
// so unit-plan suggestions never re-match per card.
// Every imported invoice line, flattened once and reused — the cross-sell
// engine needs the whole market to know what comparable clinics buy.
let _allRowsMemo = null;
function erpAllRows(){
  const sig = erpPeriods().map(p2=>p2.id+':'+(p2.rows?p2.rows.length:0)).join('|');
  if(!_allRowsMemo || _allRowsMemo.sig !== sig){
    let all = [];
    erpPeriods().forEach(p2=>{ all = all.concat(erpViewRows(p2)); });
    _allRowsMemo = { sig, all };
  }
  return _allRowsMemo.all;
}
function clinicSellGuide(clinicId){
  return UMCore.crossSellPlan({ clinicId, clinics, products, visits,
    erpRows: erpAllRows(), erpMap, today: todayStr(), limit: 3 });
}
// "What do they buy, and what do I sell them next?" — every line carries the
// evidence behind it, so the rep can say it out loud in the clinic.
function sellGuideBlock(c){
  const g = clinicSellGuide(c.id);
  const has = g.bought.length || g.cross.length || g.upsell.length;
  if(!has){
    return `<div class="section-title" style="margin-top:20px;">What to sell next</div>
    <div class="card"><div style="color:var(--muted); font-size:13px; line-height:1.5;">
      Nothing bought by this clinic yet in the imported invoices. Import a sales file (or log an order here) and this guide fills in on its own.
    </div></div>`;
  }
  const line = (icon, tag, title, sub, price) => `
    <div class="sg-row">
      <div class="ic">${icon}</div>
      <div style="flex:1; min-width:0;">
        <div class="tag">${tag}</div>
        <div class="ttl">${esc(title)}${price?` <span style="color:var(--muted); font-weight:600;">· ${money(price)}</span>`:''}</div>
        <div class="why">${esc(sub)}</div>
      </div>
    </div>`;
  const bought = g.bought.slice(0,4).map(b=>
    `<div class="sg-buy"><span class="n">${esc(b.product)}</span><span class="v">${b.units} unit${b.units===1?'':'s'} · ${money(b.net)}</span></div>`).join('');
  return `<div class="section-title" style="margin-top:20px;">What to sell next</div>
    <div class="card">
      ${bought?`<div class="sg-head">Buys today</div>${bought}<div style="height:6px;"></div>`:''}
      ${g.lapsed.map(x=>line(I('refresh'),'Re-order', x.product, x.reason, 0)).join('')}
      ${g.upsell.map(x=>line(I('arrow-up'),'Up-sell', x.product, x.reason, x.price)).join('')}
      ${g.cross.map(x=>line(I('plus'),'Cross-sell', x.product, x.reason, x.price)).join('')}
      ${(!g.lapsed.length && !g.upsell.length && !g.cross.length)?`<div style="color:var(--muted); font-size:12.5px; padding-top:8px;">No gap found against comparable clinics — this account already buys across the range.</div>`:''}
    </div>`;
}
function caAllRowsByClinic(){
  const by = {};
  let all = [];
  erpPeriods().forEach(p2=>{ all = all.concat(erpViewRows(p2)); });
  all.forEach(r=>{
    const m = UMCore.matchCustomer((r.customer||'').trim(), clinics, erpMap);
    if(!m.clinicId) return;
    (by[m.clinicId] = by[m.clinicId] || []).push(r);
  });
  return { by, all };
}
function caMonthClinicSales(){
  const today = todayStr(), mStart = today.slice(0,7)+'-01';
  const byClinic = {};
  erpPeriods().filter(p2=>p2.to>=mStart && p2.from<=today).forEach(p2=>erpViewRows(p2).forEach(r=>{
    if(r.date < mStart || r.date > today) return;
    const m = UMCore.matchCustomer((r.customer||'').trim(), clinics, erpMap);
    if(!m.clinicId) return;
    const a = byClinic[m.clinicId] || (byClinic[m.clinicId]={net:0, byBrand:{}, brandRaw:{}, docs:new Set()});
    a.net += r.net; if(r.doc) a.docs.add(r.doc);
    const b = UMCore.normBrand(r.brand);
    a.byBrand[b] = (a.byBrand[b]||0) + r.net;
    if(!a.brandRaw[b]) a.brandRaw[b] = (r.brand||'').trim();
  }));
  return byClinic;
}
function renderClinicAnalysis(){
  const chipsEl = document.getElementById('caRepChips');
  const body = document.getElementById('caBody');
  if(!chipsEl || !body) return;
  const sup = currentUser.role === 'supervisor';
  if(!caRep) caRep = sup ? (REPS[0] || null) : currentUser.name;
  if(!sup) caRep = currentUser.name;
  chipsEl.innerHTML = sup ? REPS.map(r=>`<div class="chip ${caRep===r?'on':''}" onclick="caRep='${esc(r)}'; renderClinicAnalysis();">${esc(r)}</div>`).join('') : '';
  const rep = caRep;
  if(!rep){ body.innerHTML = '<div class="empty">No reps configured yet.</div>'; return; }
  const t = targets[rep] || {};
  const brandTargets = t.brands || {};
  if(!Object.keys(brandTargets).length){
    body.innerHTML = `<div class="empty"><div class="big">🎯 No brand targets yet</div>Upload the monthly DSR targets file — every clinic then gets its own share of each brand target automatically.</div>`;
    return;
  }
  // Allocation weights use ALL uploaded invoice history, actuals use this month.
  const rowsIdx = caAllRowsByClinic();
  const allRows = rowsIdx.all;
  const alloc = UMCore.allocateClinicTargets({rep, clinics, erpRows: allRows, erpMap, brandTargets});
  const actual = caMonthClinicSales();
  const fams = UMCore.clinicFamilies(clinics);
  const today = todayStr(), mStart = today.slice(0,7)+'-01';
  const q = (document.getElementById('caSearch')||{}).value?.trim().toLowerCase() || '';

  // Group the rep's clinics into family cards (or single-clinic cards).
  const seen = new Set(); const cards = [];
  clinics.filter(c=>c.rep===rep && c.cls!=='Closed').forEach(c=>{
    if(seen.has(c.id)) return;
    const famKey = fams.byClinic[c.id];
    const members = famKey ? fams.fams[famKey].ids.map(id=>clinics.find(x=>x.id===id)).filter(Boolean) : [c];
    members.forEach(m2=>seen.add(m2.id));
    const label = famKey ? `${fams.fams[famKey].label} (${members.length} branches)` : c.name;
    // Sum allocation + actuals + brand detail across the family.
    let tgt = 0, act = 0; const tgtB = {}, actB = {};
    members.forEach(m2=>{
      const al = alloc.byClinic[m2.id]; if(al){ tgt += al.total; Object.keys(al.byBrand).forEach(b=>tgtB[b]=(tgtB[b]||0)+al.byBrand[b]); }
      const ac = actual[m2.id]; if(ac){ act += ac.net; Object.keys(ac.byBrand).forEach(b=>actB[b]=(actB[b]||0)+ac.byBrand[b]); }
    });
    // Visits + intel from the girls' reports (this month, family-wide).
    const ids = new Set(members.map(m2=>m2.id));
    const vs = visits.filter(v=>ids.has(v.clinicId) && v.date>=mStart && v.date<=today);
    const fieldN = vs.filter(v=>UMCore.isFieldVisit(v)).length;
    const callsN = vs.filter(v=>v.callOnly).length;
    const lastAll = visits.filter(v=>ids.has(v.clinicId)).sort((a,b2)=>b2.date.localeCompare(a.date));
    const lastV = lastAll[0] || null;
    const notes = lastAll.filter(v=>v.notes || v.noOrderReason).slice(0,2)
      .map(v=>({date:v.date, txt:(v.notes||v.noOrderReason||'').slice(0,110)}));
    const docs = []; members.forEach(m2=>(m2.doctors||[]).forEach(d=>docs.push(d)));
    const contact = members.map(m2=>m2.contact).find(Boolean) || '';
    // Opportunities: biggest open brand gaps (target minus sold).
    const opps = Object.keys(tgtB).map(b=>{
      const sold = actB[UMCore.normBrand(b)] || 0;
      return { brand: b, tgt: tgtB[b], sold, gap: Math.max(0, tgtB[b]-sold) };
    }).filter(o=>o.gap>0.005).sort((a,b2)=>b2.gap-a.gap);
    const pct = tgt>0 ? Math.round(act/tgt*100) : 0;
    // Concrete units for the #1 gap: "≈ 3× Cordless Plus" right on the card.
    let topUnits = null, topPlan = null;
    if(opps.length){
      const clinicRows = []; members.forEach(m2=>{ (rowsIdx.by[m2.id]||[]).forEach(r=>clinicRows.push(r)); });
      const up = UMCore.unitSellPlan({brand: opps[0].brand, gap: opps[0].gap, clinicRows, allRows, products});
      if(up.length){ topUnits = up.map(x=>`${x.units}× ${x.product}`).join(' + '); topPlan = up; }
    }
    cards.push({ id:c.id, label, cls:c.cls, members, topUnits, tgt:Math.round(tgt*100)/100, act:Math.round(act*100)/100,
      pct, gap: Math.round(Math.max(0,tgt-act)*100)/100, fieldN, callsN, lastV, notes, docs, contact, opps,
      topPlan,
      nextFollowUp: members.map(m2=>m2.nextFollowUp).filter(Boolean).sort()[0] || null });
  });

  const bm = officialRevenue(rep);
  const goal = t.revenue || Object.values(brandTargets).reduce((a,b2)=>a+b2,0);
  const daysLeft = UMCore.workingDaysBetween(today, today.slice(0,7)+'-'+String(getMonthDates(today).length).padStart(2,'0'));
  const shown = cards.filter(cd=>!q || cd.label.toLowerCase().includes(q)).sort((a,b2)=>b2.gap-a.gap);
  const covered = cards.filter(cd=>cd.act>0.005).length;

  body.innerHTML = `
    <div class="card" style="margin-bottom:12px;">
      <div class="row-between"><div style="font-weight:800; font-size:15px;">${esc(rep)} — ${new Date(today+'T00:00:00').toLocaleDateString(uiLocale(),{month:'long'})}</div>
        <span style="color:var(--muted); font-size:11.5px;">${daysLeft} working days left</span></div>
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:10px; text-align:center;">
        <div><div style="font-weight:800; font-size:14.5px;">${money(goal)}</div><div style="font-size:9.5px; color:var(--muted); letter-spacing:.06em;">TARGET</div></div>
        <div><div style="font-weight:800; font-size:14.5px;">${bm.has?money(bm.amount):'—'}</div><div style="font-size:9.5px; color:var(--muted); letter-spacing:.06em;">ACHIEVED${bm.src?`<br><span style="font-size:8px; letter-spacing:0;">${esc(bm.src)}</span>`:''}</div></div>
        <div><div style="font-weight:800; font-size:14.5px; color:${goal&&bm.has&&goal-bm.amount>0?'var(--coral-ink)':'var(--sage-ink)'};">${bm.has?money(Math.max(0,goal-bm.amount)):'—'}</div><div style="font-size:9.5px; color:var(--muted); letter-spacing:.06em;">TO GO</div></div>
        <div><div style="font-weight:800; font-size:14.5px;">${covered}/${cards.length}</div><div style="font-size:9.5px; color:var(--muted); letter-spacing:.06em;">CLINICS BOUGHT</div></div>
      </div>
    </div>
    ${shown.map(cd=>{
      const barPct = Math.max(0, Math.min(100, cd.pct)); // returns can push actuals negative
      return `<div class="card" style="margin-bottom:10px;">
        <div class="row-between">
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="cls cls-${cd.cls}">${cd.cls||'-'}</span>
            <div>
              <div class="clinic-name">${esc(cd.label)}</div>
              <div class="clinic-sub">${cd.fieldN} visit${cd.fieldN===1?'':'s'} · ${cd.callsN} call${cd.callsN===1?'':'s'} this month${cd.lastV?` · last ${fmtDate(cd.lastV.date)}`:' · never visited'}</div>
            </div>
          </div>
          <div style="text-align:start; flex-shrink:0;">
            <div style="font-weight:800; font-size:14px;">${money(cd.act)} <span style="color:var(--muted); font-weight:500; font-size:11px;">/ ${money(cd.tgt)}</span></div>
            <div style="font-size:10.5px; font-weight:700; color:${cd.pct>=100?'var(--sage-ink)':cd.pct>=50?'var(--gold-ink)':'var(--coral-ink)'};">${cd.pct}% of clinic target</div>
          </div>
        </div>
        <div style="height:6px; border-radius:3px; background:var(--paper); overflow:hidden; margin:8px 0;"><div style="width:${barPct}%; height:100%; background:${cd.pct>=100?'var(--sage)':'var(--teal)'};"></div></div>
        ${cd.opps.length?`<div style="font-size:12.5px; margin-bottom:6px;"><b>🎯 Sell next:</b> ${cd.opps.slice(0,3).map(o=>`${esc(o.brand)} <span class="num" style="color:var(--coral-ink);">${money(o.gap)}</span>`).join(' · ')}</div>${cd.topPlan?`<div style="display:flex; gap:6px; align-items:center; margin-bottom:6px; overflow:hidden;">
          ${cd.topPlan.slice(0,3).map(x=>`<div style="position:relative;">${playbookThumb(x.product, 42)}<span style="position:absolute; top:-5px; inset-inline-end:-5px; background:var(--teal); color:#fff; font-size:9.5px; font-weight:800; border-radius:99px; padding:1px 5px;">×${x.units}</span></div>`).join('')}
          <div style="font-size:11px; color:var(--teal); font-weight:600; min-width:0;">${esc(cd.opps[0].brand)}</div>
        </div>`:''}`:`<div style="font-size:12.5px; color:var(--sage-ink); margin-bottom:6px;">🏆 Clinic target fully covered</div>`}
        ${cd.docs.length?`<div style="font-size:12px; color:var(--muted); margin-bottom:4px;">👨‍⚕️ ${cd.docs.slice(0,4).map(d=>esc(d.name)+(d.title?` <span style="font-size:10.5px;">(${esc(d.title)})</span>`:'')).join(' · ')}${cd.docs.length>4?` +${cd.docs.length-4}`:''}</div>`:''}
        ${cd.contact?`<div style="font-size:12px; color:var(--muted); margin-bottom:4px;">📇 ${esc(cd.contact)}</div>`:''}
        ${cd.notes.length?`<div style="font-size:11.5px; color:var(--muted); border-top:1px dashed var(--line); padding-top:5px; margin-top:5px;">${cd.notes.map(n=>`📝 <i>${fmtDate(n.date)}:</i> ${esc(n.txt)}`).join('<br>')}</div>`:''}
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button class="chip small" onclick="openClinicAllocDetail('${cd.id}')">📊 Brand plan</button>
          <button class="chip small" onclick="openClinicDetail('${cd.id}')">${I('file')} Clinic file</button>
          ${cd.nextFollowUp?`<span class="chip small" style="pointer-events:none;">⏰ ${fmtDate(cd.nextFollowUp)}</span>`:''}
        </div>
      </div>`;
    }).join('') || '<div class="empty">No clinics match.</div>'}`;
}
// Full per-brand breakdown for one clinic/family: its share of every brand
// target vs what it actually bought — the concrete "what to sell here" plan.
function openClinicAllocDetail(clinicId){
  const c = clinics.find(x=>x.id===clinicId);
  if(!c) return;
  const rep = c.rep;
  const t = targets[rep] || {};
  const rowsIdx = caAllRowsByClinic();
  const allRows = rowsIdx.all;
  const alloc = UMCore.allocateClinicTargets({rep, clinics, erpRows: allRows, erpMap, brandTargets: t.brands||{}});
  const actual = caMonthClinicSales();
  const fams = UMCore.clinicFamilies(clinics);
  const famKey = fams.byClinic[clinicId];
  const members = famKey ? fams.fams[famKey].ids.map(id=>clinics.find(x=>x.id===id)).filter(Boolean) : [c];
  const label = famKey ? `${fams.fams[famKey].label} (${members.length} branches)` : c.name;
  const tgtB = {}, actB = {}, rawNames = {};
  members.forEach(m2=>{
    const al = alloc.byClinic[m2.id]; if(al) Object.keys(al.byBrand).forEach(b=>tgtB[b]=(tgtB[b]||0)+al.byBrand[b]);
    const ac = actual[m2.id]; if(ac){
      Object.keys(ac.byBrand).forEach(b=>{ actB[b]=(actB[b]||0)+ac.byBrand[b]; if(ac.brandRaw && ac.brandRaw[b] && !rawNames[b]) rawNames[b]=ac.brandRaw[b]; });
    }
  });
  const rows = Object.keys(tgtB).map(b=>{
    const sold = actB[UMCore.normBrand(b)] || 0;
    return {b, tgt:tgtB[b], sold, gap: tgtB[b]-sold};
  }).sort((a,b2)=>b2.gap-a.gap);
  // Nothing the clinic buys may be invisible: brands sold OUTSIDE the target
  // list (e.g. Maintenance) get their own rows too — full product coverage.
  const targetedNorms = new Set(Object.keys(tgtB).map(b=>UMCore.normBrand(b)));
  const extras = Object.keys(actB)
    .filter(n=>!targetedNorms.has(n) && actB[n] > 0.005)
    .map(n=>({b:(rawNames[n]||n), tgt:0, sold:actB[n], gap:0}))
    .sort((a,b2)=>b2.sold-a.sold);
  showModal(`
    <h3 style="margin-top:0;">📊 ${esc(label)}</h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-6px;">This clinic's share of ${esc(rep)}'s monthly brand targets, split by its own buying history — vs what it actually bought this month.</p>
    <div class="card" style="padding:10px 12px;">
      ${rows.map(r=>{
        let unitLine = '';
        if(r.gap > 0.005){
          const clinicRows = []; members.forEach(m2=>{ (rowsIdx.by[m2.id]||[]).forEach(rr=>clinicRows.push(rr)); });
          const up = UMCore.unitSellPlan({brand: r.b, gap: r.gap, clinicRows, allRows, products});
          if(up.length) unitLine = `<div style="padding:4px 0 8px;">
            ${up.map(x=>`<div style="display:flex; align-items:center; gap:9px; padding:3px 0;">
              ${playbookThumb(x.product, 40)}
              <div style="flex:1; min-width:0;"><div style="font-size:12px; font-weight:600; line-height:1.25;">${esc(x.product)}${x.mine?' <span title="re-order" style="font-size:10px;">🔁</span>':''}</div>
              <div style="font-size:11px; color:var(--muted);">${x.price.toFixed(2)} KD each</div></div>
              <div style="font-weight:800; font-size:14px; color:var(--teal); flex-shrink:0;">×${x.units}</div>
            </div>`).join('')}
            <div style="font-size:11px; color:var(--muted); text-align:start;">= ${money(up.reduce((s2,x)=>s2+x.amount,0))}</div>
          </div>`;
        }
        return `<div class="spec-row" style="${r.gap>0.005?'border-bottom:none;':''}"><span class="k">${esc(r.b)}</span>
        <span class="v">${money(r.sold)} / ${money(r.tgt)} ${r.gap>0.005?`<span style="color:var(--coral-ink); font-size:11px;">▲ ${money(r.gap)}</span>`:'<span style="color:var(--sage-ink); font-size:11px;">✓</span>'}</span></div>${unitLine}`;
      }).join('')}
    </div>
    <div style="color:var(--muted); font-size:11px; margin-top:6px;">📦 = the exact units to sell to close that brand's gap · prices are this month's real average invoice prices · 🔁 = a product this clinic already re-orders.</div>
    ${extras.length?`<div class="section-title" style="margin-top:10px;">Also bought (outside the target list)</div>
    <div class="card" style="padding:10px 12px;">
      ${extras.map(r=>`<div class="spec-row"><span class="k">${esc(r.b)}</span><span class="v">${money(r.sold)}</span></div>`).join('')}
    </div>`:''}
    ${sellGuideBlock(c)}
    <button class="btn" style="margin-top:12px;" onclick="closeModal()">Done</button>
  `);
}

function renderPlaybookGrid(){
  const pool = clinics.filter(c=>canViewClinic(c));
  const counts = {};
  const untagged = [];
  pool.forEach(c=>(c.doctors||[]).forEach(d=>{
    if(d.title && SPECIALTY_PLAYBOOK[d.title]) counts[d.title]=(counts[d.title]||0)+1;
    else untagged.push({clinicId:c.id, docId:d.id, name:d.name, clinic:c.name});
  }));
  // Doctors the team logged WITHOUT a specialty were invisible here — surface
  // them with one-tap tagging so every recorded doctor lands in a category.
  const untaggedCard = untagged.length ? `
    <div class="card" style="grid-column:1/-1; border-inline-start:4px solid var(--gold);">
      <div style="font-weight:700; font-size:14px;">🏷️ ${untagged.length} doctor${untagged.length===1?'':'s'} without a specialty</div>
      <div style="color:var(--muted); font-size:12px; margin:2px 0 8px;">Recorded by the team but not tagged yet — tap a specialty to file each one.</div>
      ${untagged.slice(0,12).map(u=>`
        <div style="padding:7px 0; border-top:1px solid var(--line);">
          <div style="font-size:13.5px; font-weight:600;">${esc(u.name)} <span style="color:var(--muted); font-weight:400; font-size:12px;">· ${esc(u.clinic)}</span></div>
          <div class="chip-row" style="margin-top:5px;">${SPECIALTIES.map(t=>`<div class="chip small" onclick="tagDoctorSpecialty('${u.clinicId}','${u.docId}','${t}')">${SPECIALTY_PLAYBOOK[t].icon} ${esc(t)}</div>`).join('')}</div>
        </div>`).join('')}
      ${untagged.length>12?`<div style="color:var(--muted); font-size:12px; text-align:center; padding-top:6px;">+${untagged.length-12} more — tag these first</div>`:''}
    </div>` : '';
  document.getElementById('playbookGrid').innerHTML = untaggedCard + SPECIALTIES.map(sp=>{
    const pb = SPECIALTY_PLAYBOOK[sp];
    const n = counts[sp]||0;
    return `<div class="tile" onclick="openPlaybook('${sp}')">
      <div class="ic">${pb.icon}</div>
      <div class="tname">${esc(sp)}</div>
      <div class="tsub">${n?n+' in your clinics':'No doctors tagged yet'}</div>
    </div>`;
  }).join('');
}
async function tagDoctorSpecialty(clinicId, docId, title){
  const c = clinics.find(x=>x.id===clinicId);
  if(!c || !canViewClinic(c)){ showToast('🔒 Not your clinic'); return; }
  const d = (c.doctors||[]).find(x=>x.id===docId);
  if(!d) return;
  d.title = title;
  await persist('clinics');
  showToast(`${SPECIALTY_PLAYBOOK[title].icon} ${d.name} → ${title}`);
  renderPlaybookGrid();
}
function openPlaybook(sp){
  const pb = SPECIALTY_PLAYBOOK[sp];
  if(!pb) return;
  const docs = [];
  clinics.filter(c=>canViewClinic(c)).forEach(c=>(c.doctors||[]).forEach(d=>{ if(d.title===sp) docs.push({name:d.name, clinic:c.name, rep:c.rep}); }));
  showModal(`
    <div class="pb-hero" style="background:linear-gradient(135deg,${pb.color} 0%,${pb.color}CC 100%);">
      <div class="ic">${pb.icon}</div>
      <h3>${esc(sp)}</h3>
      <p>${esc(pb.angle)}</p>
    </div>

    <div class="section-title" style="margin-top:0;">What they struggle with</div>
    <div class="card">${pb.pains.map(x=>`<div class="pb-item"><div class="pb-bullet" style="background:var(--coral-dim); color:var(--coral-ink);">!</div><div>${esc(x)}</div></div>`).join('')}</div>

    <div class="section-title">Lead with these products</div>
    <div class="card">${pb.lead.map((x,i)=>`<div class="pb-item"><div class="pb-bullet">${i+1}</div><div>${esc(x)}</div></div>`).join('')}</div>

    ${(()=>{ const tagged = products.filter(p=>(p.specialties||[]).includes(sp));
      return tagged.length ? `<div class="section-title">From our catalog</div>
        <div class="card">${tagged.map(p=>`<div class="qty-row" style="cursor:pointer; align-items:center; gap:10px;" onclick="closeModal(); openProductDetail('${esc(productKey(p))}')">
          ${playbookThumb(p.name, 44)}
          <div class="pname">${esc(p.name)}<br><span style="color:var(--muted); font-size:11.5px;">${esc(p.brand||'')}${p.price!=null?' · '+p.price.toFixed(2)+' KD':''}</span></div>
        </div>`).join('')}</div>` : ''; })()}

    <div class="section-title">Tips &amp; tricks</div>
    <div class="card">${pb.hooks.map(x=>`<div class="pb-item"><div class="pb-bullet">\u2713</div><div>${esc(x)}</div></div>`).join('')}</div>

    <div class="section-title">Common objection</div>
    <div class="pb-obj">
      <div class="q">${esc(pb.objection.q)}</div>
      <div>${esc(pb.objection.a)}</div>
    </div>

    ${docs.length?`<div class="section-title">Your ${esc(sp)}s (${docs.length})</div>
      <div class="card">${docs.map(d=>`<div class="doc-row"><div class="dname">${esc(d.name)}</div><div class="dsub">${esc(d.clinic)}</div></div>`).join('')}</div>`:''}
  `);
}

// ---- PRODUCT DETAIL ----
function openProductDetail(pid){
  const p = findProduct(pid);
  if(!p) return;
  const keys = [pid, p.id, productKey(p)];
  const timesDiscussed = visits.filter(v=>(v.products||[]).some(x=>keys.includes(x))).length;
  let unitsSold = 0, revenue = 0;
  visits.forEach(v=>(v.orders||[]).forEach(o=>o.items.forEach(it=>{
    if(keys.includes(it.productId)){
      unitsSold += it.qty;
      const unit = it.unitPrice!=null ? it.unitPrice : (p.price!=null ? p.price : 0);
      revenue += unit*it.qty*(1-(o.discountPct||0)/100);
    }
  })));
  showModal(`
    ${p.img?`<img class="pbig" src="${p.img}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`:''}
    <div class="row-between" style="margin:0 0 4px;">
      <h3 style="margin:0;">${esc(p.name)}</h3>
      ${currentUser.role==='supervisor'?`<button class="chip small" style="flex-shrink:0;" onclick="openEditProduct('${esc(productKey(p))}')">${I('pencil')} Edit</button>`:''}
    </div>
    <div style="color:var(--muted); font-size:13.5px; margin-bottom:16px;">${esc(p.brand||'')}</div>

    <div class="section-title" style="margin-top:0;">Technical data</div>
    <div class="card">
      <div class="spec-row"><span class="k">Item code</span><span class="v">${esc(p.id)}</span></div>
      ${p.barcode?`<div class="spec-row"><span class="k">Barcode</span><span class="v">${esc(p.barcode)}</span></div>`:''}
      <div class="spec-row"><span class="k">Unit price</span><span class="v">${p.price!=null?p.price.toFixed(3)+' KD':'\u2014'}</span></div>
      ${p.cat?`<div class="spec-row"><span class="k">Category</span><span class="v">${esc(p.cat)}</span></div>`:''}
      ${p.stock!==undefined?`<div class="spec-row"><span class="k">Website stock</span><span class="v" style="color:${p.stock?'var(--sage-ink)':'var(--coral-ink)'}">${p.stock?'In stock':'Out of stock'}</span></div>`:''}
      ${p.case?`<div class="spec-row"><span class="k">Case count</span><span class="v">${esc(p.case)}</span></div>`:''}
      ${p.age?`<div class="spec-row"><span class="k">Age group</span><span class="v">${esc(p.age)}</span></div>`:''}
    </div>

    ${p.desc?`<div class="section-title">Product description</div>
      <div class="card" style="font-size:13.5px; line-height:1.6;">${esc(p.desc)}</div>`:''}

    ${(p.specialties&&p.specialties.length)?`<div class="section-title">Best fit for</div>
      <div class="chip-row">${p.specialties.map(sp=>SPECIALTY_PLAYBOOK[sp]?`<div class="chip small" onclick="closeModal(); openPlaybook('${esc(sp)}')">${SPECIALTY_PLAYBOOK[sp].icon} ${esc(sp)}</div>`:'').join('')}</div>`:''}

    <div class="section-title">Sales notes &amp; materials</div>
    <div class="card">
      ${currentUser.role==='supervisor' ? `
        <textarea id="pNotesEdit" placeholder="Key selling points, clinical claims, competitor comparison...">${esc(p.salesNotes||'')}</textarea>
        <button class="btn secondary small" onclick="saveProductNotes('${esc(productKey(p))}')">Save notes</button>
      ` : `
        ${p.salesNotes?`<div style="font-size:13.5px; line-height:1.6; white-space:pre-wrap;">${esc(p.salesNotes)}</div>`:`<div style="color:var(--muted); font-size:13px;">No sales notes yet.</div>`}
      `}
      <div id="pMaterials" style="margin-top:10px;"></div>
      ${currentUser.role==='supervisor' ? `
        <div style="border-top:1px solid var(--line); margin-top:10px; padding-top:10px;">
          <input type="text" id="pMatTitle" placeholder="Material name (e.g. Brochure, Price list, Video)">
          <input type="text" id="pMatUrl" placeholder="Link (https://...)" style="margin-top:8px;">
          <button class="btn secondary small" style="margin-top:8px;" onclick="addProductMaterial('${esc(productKey(p))}')">+ Add material</button>
        </div>
      ` : ''}
    </div>

    ${categoryGuideCardHTML(p.cat)}

    <div class="section-title">Your performance with this product</div>
    <div class="card">
      <div class="spec-row"><span class="k">Times discussed</span><span class="v">${timesDiscussed}</span></div>
      <div class="spec-row"><span class="k">Units ordered</span><span class="v">${unitsSold}</span></div>
      <div class="spec-row"><span class="k">Sales generated</span><span class="v">${money(revenue)}</span></div>
    </div>
  `);
  renderProductMaterials(pid);
}

async function saveProductNotes(pid){
  if(currentUser.role!=='supervisor'){ showToast('Only a supervisor can edit sales materials'); return; }
  const p = findProduct(pid); if(!p) return;
  p.salesNotes = document.getElementById('pNotesEdit').value.trim();
  await persist('products');
  showToast('Saved');
}
// ---- PRODUCT MATERIALS (multiple links per product) ----
// Legacy single-link docUrl entries are folded into the materials list on read.
function productMaterials(p){
  const mats = (p.materials||[]).slice();
  if(p.docUrl && safeUrl(p.docUrl) && !mats.some(m=>m.url===p.docUrl)) mats.unshift({title:'Material', url:p.docUrl, legacy:true});
  return mats;
}
function renderProductMaterials(pid){
  const el = document.getElementById('pMaterials');
  const p = findProduct(pid);
  if(!el || !p) return;
  const mats = productMaterials(p);
  if(!mats.length){ el.innerHTML = `<div style="color:var(--muted); font-size:12.5px;">No materials attached yet.</div>`; return; }
  el.innerHTML = mats.map((m,i)=>`
    <div class="row-between" style="gap:8px; margin-top:6px;">
      <a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener noreferrer" class="btn secondary small" style="flex:1; display:block; text-align:center; text-decoration:none;">📄 ${esc(m.title||'Material')}</a>
      ${currentUser.role==='supervisor'?`<button class="chip small" onclick="removeProductMaterial('${esc(productKey(p))}',${i})">✕</button>`:''}
    </div>`).join('');
}
async function addProductMaterial(pid){
  if(currentUser.role!=='supervisor') return;
  const p = findProduct(pid); if(!p) return;
  const title = document.getElementById('pMatTitle').value.trim();
  const rawUrl = document.getElementById('pMatUrl').value.trim();
  if(!rawUrl || !safeUrl(rawUrl)){ showToast('Link must start with http:// or https://'); return; }
  p.materials = productMaterials(p).map(m=>({title:m.title, url:m.url}));
  p.materials.push({title: title || 'Material', url: safeUrl(rawUrl)});
  delete p.docUrl;
  document.getElementById('pMatTitle').value='';
  document.getElementById('pMatUrl').value='';
  await persist('products');
  renderProductMaterials(pid);
  showToast('📄 Material added');
}
async function removeProductMaterial(pid, idx){
  if(currentUser.role!=='supervisor') return;
  const p = findProduct(pid); if(!p) return;
  p.materials = productMaterials(p).map(m=>({title:m.title, url:m.url}));
  p.materials.splice(idx, 1);
  delete p.docUrl;
  await persist('products');
  renderProductMaterials(pid);
}

// ---- CATEGORY SELLING GUIDES ----
function guideLinks(g){
  return (g && Array.isArray(g.links) ? g.links : []).filter(l=>l && safeUrl(l.url));
}
function guideBlock(title, icon, text){
  if(!text) return '';
  return `<div style="margin-top:10px;"><div style="font-weight:700; font-size:12.5px; margin-bottom:4px;">${icon} ${esc(title)}</div>
    <div style="font-size:13px; line-height:1.65; white-space:pre-wrap;">${esc(text)}</div></div>`;
}
function categoryGuideCardHTML(cat){
  if(!cat) return '';
  const g = categoryGuides[cat];
  if(!g) return '';
  return `
    <div class="section-title"><span>${I('book')} How to sell: ${esc(cat)}</span></div>
    <div class="card">
      ${guideBlock('Why it sells', I('sparkles'), g.sell)}
      ${guideBlock('How to sell it', I('target'), g.how)}
      ${guideBlock('Objections & answers', I('shield'), g.objections)}
      ${guideLinks(g).length?`<div style="margin-top:10px;">${guideLinks(g).map(l=>`
        <a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer" class="btn secondary small" style="display:block; text-align:center; text-decoration:none; margin-top:6px;">🔗 ${esc(l.title||'Link')}</a>`).join('')}</div>`:''}
      ${currentUser.role==='supervisor'?`<button class="chip small" style="margin-top:10px;" onclick="openEditCategoryGuide('${esc(cat).replace(/'/g,"\\'")}')">✏️ Edit this guide</button>`:''}
    </div>`;
}
function openCategoryGuides(){
  const cats = {};
  products.forEach(p=>{ if(p.cat) cats[p.cat] = (cats[p.cat]||0)+1; });
  Object.keys(categoryGuides).forEach(c=>{ if(!(c in cats)) cats[c] = 0; });
  const names = Object.keys(cats).sort((a,b)=>cats[b]-cats[a] || a.localeCompare(b));
  showModal(`
    <h3 style="margin-top:0;">${I('book')} Selling guides</h3>
    <div style="color:var(--muted); font-size:13px; margin-bottom:12px;">How to sell every category: key claims, pitch steps, objection answers and official materials. Also shown inside each product's page.</div>
    ${names.map(c=>{
      const g = categoryGuides[c];
      return `<div class="card" style="cursor:pointer; padding:12px 14px; margin-bottom:8px;" onclick="openCategoryGuide('${esc(c).replace(/'/g,"\\'")}')">
        <div class="row-between">
          <div style="font-weight:700; font-size:14px;">${esc(c)}</div>
          <div style="color:var(--muted); font-size:12px; flex-shrink:0;">${cats[c]} product${cats[c]===1?'':'s'} ›</div>
        </div>
        ${g?'':'<div style="color:var(--coral-ink); font-size:12px; margin-top:2px;">No guide yet</div>'}
      </div>`;
    }).join('')}
  `);
}
function openCategoryGuide(cat){
  const g = categoryGuides[cat];
  const catProds = products.filter(p=>p.cat===cat);
  showModal(`
    <div class="row-between" style="margin:0 0 4px;">
      <h3 style="margin:0;">${I('book')} ${esc(cat)}</h3>
      ${currentUser.role==='supervisor'?`<button class="chip small" style="flex-shrink:0;" onclick="openEditCategoryGuide('${esc(cat).replace(/'/g,"\\'")}')">${I('pencil')} Edit</button>`:''}
    </div>
    <div style="color:var(--muted); font-size:12.5px; margin-bottom:10px;">${catProds.length} product${catProds.length===1?'':'s'} in this category</div>
    ${g?`<div class="card">
      ${guideBlock('Why it sells', I('sparkles'), g.sell)}
      ${guideBlock('How to sell it', I('target'), g.how)}
      ${guideBlock('Objections & answers', I('shield'), g.objections)}
      ${guideLinks(g).length?`<div style="margin-top:10px;">${guideLinks(g).map(l=>`
        <a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer" class="btn secondary small" style="display:block; text-align:center; text-decoration:none; margin-top:6px;">🔗 ${esc(l.title||'Link')}</a>`).join('')}</div>`:''}
    </div>`:`<div class="empty">No guide for this category yet.${currentUser.role==='supervisor'?' Tap ✏️ Edit to write one.':''}</div>`}
    ${catProds.length?`<div class="section-title">Products in this category</div>
      <div class="card">${catProds.map(p=>`<div class="qty-row" style="cursor:pointer;" onclick="openProductDetail('${productKey(p)}')">
        <div class="pname">${esc(p.name)}<br><span style="color:var(--muted); font-size:11.5px;">${esc(p.brand||'')}${p.price!=null?' · '+p.price.toFixed(2)+' KD':''}</span></div>
        <span style="color:var(--muted);">›</span></div>`).join('')}</div>`:''}
    <button class="btn secondary" style="margin-top:12px;" onclick="openCategoryGuides()">‹ All guides</button>
  `);
}
function openEditCategoryGuide(cat){
  if(currentUser.role!=='supervisor'){ showToast('Only a supervisor can edit guides'); return; }
  const g = categoryGuides[cat] || {sell:'', how:'', objections:'', links:[]};
  window._guideLinks = guideLinks(g).map(l=>({title:l.title, url:l.url}));
  showModal(`
    <h3 style="margin-top:0;">${I('pencil')} Edit guide — ${esc(cat)}</h3>
    <label>${I('sparkles')} Why it sells (key claims)</label>
    <textarea id="cgSell" style="min-height:110px;">${esc(g.sell||'')}</textarea>
    <label>${I('target')} How to sell it (pitch steps)</label>
    <textarea id="cgHow" style="min-height:110px;">${esc(g.how||'')}</textarea>
    <label>${I('shield')} Objections &amp; answers</label>
    <textarea id="cgObj" style="min-height:90px;">${esc(g.objections||'')}</textarea>
    <label>🔗 Official links &amp; materials</label>
    <div id="cgLinks"></div>
    <input type="text" id="cgLinkTitle" placeholder="Link name (e.g. Clinical studies)" style="margin-top:8px;">
    <input type="text" id="cgLinkUrl" placeholder="https://..." style="margin-top:8px;">
    <button class="btn secondary small" style="margin-top:8px;" onclick="addGuideLink()">+ Add link</button>
    <button class="btn" style="margin-top:14px;" onclick="saveCategoryGuide('${esc(cat).replace(/'/g,"\\'")}')">Save guide</button>
  `);
  renderGuideLinks();
}
function renderGuideLinks(){
  const el = document.getElementById('cgLinks');
  if(!el) return;
  const links = window._guideLinks || [];
  el.innerHTML = links.length ? links.map((l,i)=>`
    <div class="row-between" style="gap:8px; margin-top:6px;">
      <div style="flex:1; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔗 ${esc(l.title||'Link')} <span style="color:var(--muted);">${esc(l.url)}</span></div>
      <button class="chip small" onclick="removeGuideLink(${i})">✕</button>
    </div>`).join('') : `<div style="color:var(--muted); font-size:12.5px;">No links yet.</div>`;
}
function addGuideLink(){
  const title = document.getElementById('cgLinkTitle').value.trim();
  const rawUrl = document.getElementById('cgLinkUrl').value.trim();
  if(!rawUrl || !safeUrl(rawUrl)){ showToast('Link must start with http:// or https://'); return; }
  (window._guideLinks = window._guideLinks || []).push({title: title || 'Link', url: safeUrl(rawUrl)});
  document.getElementById('cgLinkTitle').value='';
  document.getElementById('cgLinkUrl').value='';
  renderGuideLinks();
}
function removeGuideLink(i){
  (window._guideLinks||[]).splice(i,1);
  renderGuideLinks();
}
async function saveCategoryGuide(cat){
  if(currentUser.role!=='supervisor') return;
  categoryGuides[cat] = {
    sell: document.getElementById('cgSell').value.trim(),
    how: document.getElementById('cgHow').value.trim(),
    objections: document.getElementById('cgObj').value.trim(),
    links: (window._guideLinks||[]).map(l=>({title:l.title, url:l.url})),
  };
  await persist('categoryGuides');
  showToast('📚 Guide saved');
  openCategoryGuide(cat);
}

// ---- COVERAGE BOARD: done & still needed, in one place ----
let covDays = 7;        // review window: 7 / 30 / 90 days
let covRep = null;      // null = follow user role default
function openCoverageBoard(){
  covRep = covRep || (currentUser.role === 'rep' ? currentUser.name : 'all');
  renderCoverageBoard();
}
function setCovDays(d){ covDays = d; renderCoverageBoard(); }
function setCovRep(r){ covRep = ownRepOnly(r); renderCoverageBoard(); }
function covReasonLabel(r){
  if(r.key === 'overdue') return '⏰ Follow-up overdue since ' + fmtDate(r.date) + ' — a promised visit is the easiest sale, book it first';
  if(r.key === 'due-today') return '📌 Follow-up due TODAY — keep the promise';
  if(r.key === 'missed-plan') return '📅 Was planned ' + (r.count > 1 ? r.count + ' times' : 'on ' + fmtDate(r.date)) + ' but never visited — reschedule it';
  if(r.key === 'never-visited') return '🆕 Never visited — a priority clinic still waiting for a first impression';
  if(r.key === 'dormant') return '😴 Quiet for ' + r.days + ' days — top clinics buy elsewhere when unattended';
  if(r.key === 'due-soon') return '🗓️ Follow-up due ' + fmtDate(r.date) + ' — put it in the day plan now';
  if(r.key === 'not-covered') return '🚶 Not visited in this window' + (r.lastVisit ? ' — last visit ' + fmtDate(r.lastVisit) : '') + ' — fit it into an upcoming route';
  return '';
}
// ERP figures for a window: net + invoice count for the rep filter, and the
// net attributed to each clinic via the remembered customer mapping.
function erpWindowStats(from, to, repFilter){
  const ps = erpPeriods().filter(p => (!from || p.to >= from) && (!to || p.from <= to));
  if(!ps.length) return null;
  const byClinic = {}, docs = {};
  let net = 0;
  ps.forEach(p => erpViewRows(p).forEach(r => {
    if(!UMCore.inRange(r.date, from, to)) return;
    const rep = UMCore.erpRowRep(r, clinics, erpMap, p.repMap||{});
    if(!rep || (repFilter !== 'all' && rep !== repFilter)) return;
    net += r.net;
    if(r.type !== 'return') docs[r.doc] = 1;
    const m = UMCore.matchCustomer(r.customer, clinics, erpMap);
    if(m.clinicId) byClinic[m.clinicId] = (byClinic[m.clinicId]||0) + r.net;
  }));
  Object.keys(byClinic).forEach(k => byClinic[k] = Math.round(byClinic[k]*100)/100);
  return { byClinic, invoices: Object.keys(docs).length, net: Math.round(net*100)/100 };
}
function renderCoverageBoard(){
  const d = new Date(); d.setDate(d.getDate() - covDays);
  const from = UMCore.localDateStr(d), to = todayStr();
  const cov = UMCore.clinicCoverage({ from, to, today: to, repFilter: covRep, visits, clinics, dayPlans });
  const ew = erpWindowStats(from, to, covRep);
  const coach = UMCore.coachInsights({ erpMtd: erpMtdMap(), from, to, today: to, repFilter: covRep, visits, clinics, targets: blendedTargets(), dayPlans })
    .filter(i => i.level !== 'good').slice(0, 3);
  const repChips = currentUser.role === 'supervisor'
    ? `<div class="chip-row" style="margin-bottom:8px;">${['all', ...REPS].map(r =>
        `<div class="chip small ${covRep===r?'on':''}" onclick="setCovRep('${esc(r)}')">${r==='all'?'Whole team':esc(r)}</div>`).join('')}</div>` : '';
  const tile = (n, l) => `<div style="background:var(--paper); border-radius:10px; padding:10px 6px; text-align:center;">
    <div style="font-size:18px; font-weight:800; color:var(--green);">${n}</div>
    <div style="font-size:10.5px; color:var(--muted); line-height:1.3;">${l}</div></div>`;
  const clinicOf = id => clinics.find(c => c.id === id);
  const visitedRows = cov.visited.map(c => {
    const cl = clinicOf(c.id);
    const detail = c.detail.map(v => {
      const names = cl ? contactNames(v, cl) : '';
      return `<div style="padding:6px 0; border-top:1px dashed var(--line); font-size:12.5px; line-height:1.5;">
        ${fmtDate(v.date)} · ${esc(v.rep)}${v.withRep?' 🤝 '+esc(v.withRep):''}${v.callOnly?' · 📞 call':''}
        ${v.orderTaken?` · 🛒 <b>${money(v.orderTotal)}</b>`:(v.noOrderReason?` · no order (${esc(v.noOrderReason)})`:'')}
        ${names?`<br>👥 ${esc(names)}`:''}
        ${v.notes?`<br><span style="color:var(--muted);">“${esc(v.notes)}”</span>`:''}
      </div>`;
    }).join('');
    return `<details class="card" style="padding:12px 14px; margin-bottom:8px;">
      <summary style="cursor:pointer; list-style:none;">
        <div class="row-between">
          <div style="display:flex; align-items:center; gap:9px;">
            <span class="cls cls-${c.cls}">${c.cls||'-'}</span>
            <div>
              <div style="font-weight:700; font-size:14px;">${esc(c.name)}</div>
              <div style="color:var(--muted); font-size:12px;">${c.visits} visit${c.visits===1?'':'s'}${c.calls?` (${c.calls} call${c.calls===1?'':'s'})`:''} · ${c.contacts} contact${c.contacts===1?'':'s'} · ${c.orders?`🛒 ${money(c.revenue)}`:'no orders logged'}${ew && ew.byClinic[c.id]?` · 💠 ${money(ew.byClinic[c.id])} invoiced`:''}</div>
            </div>
          </div>
          <span style="color:var(--muted); font-size:12px; flex-shrink:0;">details ▾</span>
        </div>
      </summary>
      ${detail}
      ${c.nextFollowUp?`<div style="font-size:12px; color:var(--muted); margin-top:6px;">Next follow-up: ${fmtDate(c.nextFollowUp)}</div>`:''}
      <button class="chip small" style="margin-top:8px;" onclick="closeModal(); openClinicDetail('${esc(c.id)}')">${I('file')} Open clinic</button>
    </details>`;
  }).join('');
  const needsRows = cov.needsVisit.map(c => `
    <div class="card" style="padding:12px 14px; margin-bottom:8px; border-inline-start:4px solid ${c.weight<=1?'var(--coral)':c.weight<=4?'#FF9500':'var(--teal)'};">
      <div class="row-between">
        <div style="display:flex; align-items:center; gap:9px;">
          <span class="cls cls-${c.cls}">${c.cls||'-'}</span>
          <div>
            <div style="font-weight:700; font-size:14px;">${esc(c.name)}</div>
            <div style="color:var(--muted); font-size:12px;">${esc(c.rep||'')}${c.lastVisit?` · last visit ${fmtDate(c.lastVisit)}`:' · never visited'}${ew && ew.byClinic[c.id]?` · 💠 ${money(ew.byClinic[c.id])} invoiced (no visit!)`:''}</div>
          </div>
        </div>
      </div>
      ${c.reasons.map(r=>`<div style="font-size:12.5px; line-height:1.5; margin-top:6px;">${covReasonLabel(r)}</div>`).join('')}
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="chip small" onclick="closeModal(); quickLogFrom('${esc(c.id)}')">${I('plus')} Log a visit</button>
        <button class="chip small" onclick="closeModal(); openClinicDetail('${esc(c.id)}')">${I('file')} Open clinic</button>
      </div>
    </div>`).join('');
  showModal(`
    <h3 style="margin-top:0;">${I('clipboard')} Coverage review</h3>
    <div style="color:var(--muted); font-size:12.5px; margin-bottom:10px;">Everything done and still needed — last ${covDays} days${covRep!=='all'?' · '+esc(covRep):''}</div>
    ${repChips}
    <div class="chip-row" style="margin-bottom:12px;">
      <div class="chip small ${covDays===7?'on':''}" onclick="setCovDays(7)">7 days</div>
      <div class="chip small ${covDays===30?'on':''}" onclick="setCovDays(30)">30 days</div>
      <div class="chip small ${covDays===90?'on':''}" onclick="setCovDays(90)">90 days</div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:12px;">
      ${tile(cov.stats.visitedCount + '/' + cov.stats.totalClinics, 'Clinics covered (' + cov.stats.coveragePct + '%)')}
      ${tile(cov.stats.needsCount, 'Need a visit')}
      ${ew
        ? tile(ew.invoices + (cov.stats.orders ? ' / ' + cov.stats.orders : ''), 'ERP invoices' + (cov.stats.orders ? ' / logged' : ''))
        : tile(cov.stats.orders, 'Orders logged')}
      ${ew
        ? tile(money(ew.net), 'Sales (ERP)')
        : tile(money(cov.stats.revenue), 'Sales logged')}
    </div>
    ${ew && cov.stats.revenue ? `<div style="color:var(--muted); font-size:11.5px; margin:-6px 0 10px;">App-logged in this window: ${cov.stats.orders} order${cov.stats.orders===1?'':'s'} · ${money(cov.stats.revenue)}</div>` : ''}
    ${coach.length?`<div class="section-title" style="margin-top:0;">🧭 Top advice right now</div>
      ${coach.map(i=>`<div class="card" style="padding:10px 14px; margin-bottom:6px; border-inline-start:4px solid ${i.level==='act'?'var(--coral)':'#FF9500'};">
        <div style="font-weight:700; font-size:13px;">${i.icon} ${esc(i.title)}</div>
        <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:2px;">${esc(i.detail)}</div>
      </div>`).join('')}`:''}
    <div class="section-title">✅ Visited (${cov.stats.visitedCount}) — tap for the visit summary</div>
    ${visitedRows || '<div class="empty">No visits in this window.</div>'}
    <div class="section-title">⏳ Not visited in this window (${cov.stats.needsCount})</div>
    <div style="color:var(--muted); font-size:11.5px; margin:-4px 0 8px;">${cov.stats.visitedCount} visited + ${cov.stats.needsCount} not visited = ${cov.stats.totalClinics} active clinics — most urgent first.</div>
    ${needsRows || '<div class="empty">Nothing pending — every clinic is covered. 👏</div>'}
  `);
}

// Weekly rhythm: nudge the supervisor when the sales data is getting stale.
// The sales data's health is always said out loud: rows that did not load,
// an index that never loaded, or a copy served from this device's mirror —
// every one of these used to look exactly like "the data disappeared".
function erpHealthCard(){
  if(_loadFailed.erpSales) return `<div class="card" style="border-inline-start:4px solid var(--coral); margin-bottom:6px;">
    <div style="font-weight:700; font-size:13.5px;">⚠️ ملفات المبيعات لم تُحمَّل من السحابة</div>
    <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:3px;">لا شيء ضاع — الاتصال لم يكتمل عند الفتح. أرقام المبيعات مخفية مؤقتًا، والحفظ موقوف حتى لا تُكتب صفحة فارغة فوق ملفاتك. <b>أعد فتح التطبيق على اتصال جيد.</b></div>
  </div>`;
  if(_erpBroken.length){
    const names = erpPeriods().filter(p => p && p.rowsMissing).map(p => `${fmtDate(p.from)} – ${fmtDate(p.to)}`).join(' · ');
    return `<div class="card" style="border-inline-start:4px solid var(--coral); margin-bottom:6px;">
    <div style="font-weight:700; font-size:13.5px;">⚠️ سطور ${_erpBroken.length === 1 ? 'ملف مبيعات' : _erpBroken.length + ' ملفات مبيعات'} لم تُحمَّل</div>
    <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:3px;">${esc(names)} — الملفات محفوظة في السحابة لكن سطورها لم تصل لهذا الجهاز، فأرقامها غير ظاهرة الآن. لا يُكتب فوقها شيء.</div>
    <div class="chip-row" style="margin-top:8px;"><div class="chip small on" onclick="retryErpRows()">🔄 إعادة التحميل</div><div class="chip small" onclick="openErpImport()">📥 أعد رفع الملف</div></div>
  </div>`;
  }
  if(_mirrorUsed.erpSales) return `<div class="card" style="border-inline-start:4px solid var(--gold-ink, #B8860B); margin-bottom:6px;">
    <div style="font-weight:700; font-size:13.5px;">📴 أرقام المبيعات من نسخة هذا الجهاز</div>
    <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:3px;">السحابة لم تُقرأ عند الفتح — الأرقام آخر ما شاهده هذا الجهاز وقد تكون أقدم من المحفوظ. أي رفع جديد يُدمج مع السحابة عند الحفظ.</div>
  </div>`;
  return '';
}
// New month: the two monthly inputs (this month's DSR, then the weekly sales
// file) are asked for explicitly — nothing rolls over unnoticed.
function monthInputsCard(){
  const stale = REPS.filter(r => targetStaleMonth(r));
  if(!stale.length) return '';
  const m = targetStaleMonth(stale[0]);
  return `<div class="card clickable" style="border-inline-start:4px solid var(--amber); margin-bottom:6px;" onclick="openErpImport()">
    <div style="font-weight:700; font-size:13.5px;">🗓️ ${monthLabel(todayStr().slice(0,7))} — المدخلات الشهرية مطلوبة</div>
    <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:3px;">التارغت المعروض الآن من ملف <b>${esc(monthLabel(m))}</b>. ارفع ملف DSR لهذا الشهر (يضبط التارغت والرقم الرسمي)، ثم ملف المبيعات الأسبوعي كالمعتاد. الزيارات والنِّسب تبدأ من الصفر تلقائيًا مع أول يوم في الشهر.</div>
  </div>`;
}
function renderErpNudge(){
  const el = document.getElementById('erpNudge');
  if(!el) return;
  if(currentUser.role !== 'supervisor'){ el.style.display = 'none'; return; }
  const health = erpHealthCard() + monthInputsCard();
  const latest = erpPeriods().slice().sort((a,b)=>(b.to||'').localeCompare(a.to||''))[0];
  const staleDays = latest ? UMCore.daysBetween(latest.to, todayStr()) : null;
  const stale = !latest || staleDays >= 7;
  el.style.display = (stale || health) ? 'block' : 'none';
  if(!stale && !health){ el.innerHTML = ''; return; }
  el.innerHTML = health + (stale ? `<div class="card clickable" style="border-inline-start:4px solid var(--purple); margin-bottom:6px;" onclick="openErpImport()">
    <div style="font-weight:700; font-size:13.5px;">${I('download')} Weekly sales file due</div>
    <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:3px;">
      ${latest ? `Latest ERP data covers up to ${fmtDate(latest.to)} (${staleDays} days ago).` : 'No ERP sales file imported yet.'}
      Import this week's file to keep coaching based on real invoices. Tap to import →</div>
  </div>` : '');
}

