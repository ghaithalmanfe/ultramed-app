// load / persist, ERP split storage, merge-on-save, offline layer, tombstones
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- LOAD / PERSIST (shared team data) ----
let _docRemap = {}; // duplicate doctor id → surviving id, filled while clinics normalize
// Visits that named a duplicate doctor record now name the surviving one, so
// every doctor's history stays whole — the people met and the prescription
// pads given to them (UMCore.remapVisitDoctors; lines that then name the same
// type and person are added together). Returns how many visits changed.
function applyDoctorRemap(){
  const ids = Object.keys(_docRemap);
  if(!ids.length) return 0;
  let changed = 0;
  const viaCore = typeof UMCore.remapVisitDoctors === 'function'; // an old cached core.js: the people met only, as before
  (visits || []).forEach(v => {
    if(!v) return;
    if(viaCore){ if(UMCore.remapVisitDoctors(v, _docRemap)) changed++; return; }
    let hit = false;
    if(Array.isArray(v.doctorIds)){
      const next = [...new Set(v.doctorIds.map(id => _docRemap[id] || id))];
      if(JSON.stringify(next) !== JSON.stringify(v.doctorIds)){ v.doctorIds = next; hit = true; }
    }
    if(v.doctorId && _docRemap[v.doctorId]){ v.doctorId = _docRemap[v.doctorId]; hit = true; }
    if(hit) changed++;
  });
  return changed;
}
function normalizeClinic(c){
  c.profileNotes = c.profileNotes || '';
  c.account = c.account || null;
  // 'prescription' | 'direct' | 'both' | null — many clinics do both: they
  // prescribe to patients AND buy stock for the practice.
  c.dealType = ['prescription','direct','both'].includes(c.dealType) ? c.dealType : null;
  c.noSaleReason = c.noSaleReason || ''; // why this account has no sales yet
  c.isNew = c.isNew || false;
  // doctors must tolerate ANY stored shape — one odd record in one clinic must
  // never be able to take the whole list down with it.
  c.doctors = (Array.isArray(c.doctors) ? c.doctors : [])
    .filter(d => d && typeof d === 'object')
    .map(d => Object.assign({ title:'', phone:'', birthday:'', cadence:'', notes:'', handovers:[] }, d));
  c.doctors.forEach(d => { if(!Array.isArray(d.handovers)) d.handovers = []; });
  // One person, one record: duplicates (same name, another "Dr." spelling)
  // collapse into the first; visits that pointed at the duplicate follow it.
  const dd = UMCore.dedupeDoctors(c.doctors);
  if(Object.keys(dd.remap).length){ c.doctors = dd.doctors; Object.assign(_docRemap, dd.remap); }
  c.contact = c.contact || '';
  c.phone = c.phone || '';
  c.lastVisit = c.lastVisit || null;
  c.nextFollowUp = c.nextFollowUp || null;
  return c;
}
// The only safe way to normalize a whole list: a corrupt element is kept AS-IS
// (never lost, never allowed to throw away the other clinics with it).
function normalizeClinics(list){
  return (Array.isArray(list) ? list : [])
    .filter(c => c && typeof c === 'object')
    .map(c => { try{ return normalizeClinic(c); }catch(e){ console.error('bad clinic record kept raw', c && c.id, e); return c; } });
}
// Official product photos from ultramedgcc.com (the company's own store),
// matched by SKU/barcode first and exact title-similarity second. Filled in
// ONCE for products that have no image yet — a photo the supervisor set by
// hand is never overwritten.
const PRODUCT_IMG_SEED = {"Shenzhen|Aligner & Retainer Case": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Shenzhen-Aligner___Retainer_Case-Blue_x_Black-XS037_BLACK-1.png?width=400", "FLASH|Aligner Cleaner + Whitening Foam": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/FLASH-Aligner_Cleaner___Whitening_Foam-50ML-6974041280483-1.png?width=400", "HiSmile|Coconut Toothpaste": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/HiSmile-Coconut_Toothpaste-60G-93568623-1.png?width=400", "Waterpik|Cordless Freedom Water Flosser": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Waterpik-Cordless_Freedom_Water_Flosser-Black-73950304368-1.png?width=400", "Waterpik|Cordless Select Water Flosser": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Waterpik-Cordless_Select_Water_Flosser-White-73950304009-1.png?width=400", "Silonn|Countertop Bullet Ice Maker with Handle": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Silonn-Countertop_Bullet_Ice_Maker_with_Handle-Stainless_Steel-5070002067856-1.png?width=400", "UNDO|Deep Undo": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/UNDO-Bundle.jpg?width=400", "Ultramed|Dr. Mubarak Alsaeed - The Full Fledged Smile Kit": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Mubarak_sBundle.jpg?width=400", "Ultramed|Dr. Waleed Al Yaseen - Your Smile Deserves It Kit": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Waleedbundle.jpg?width=400", "Ultramed|Dr. Mohammad Al Mazedi - Smile Makeover Care Kit": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Mohammed_sBundle.jpg?width=400", "Ultramed|Dr. Rawan Khwaiteem - The 10/10 for Kids Kit": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Rawan_sBundle.jpg?width=400", "FLASH|Eco-Friendly Dental Floss for Kids": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/FLASH-Eco-Friendly_Dental_Floss_for_Kids-71221740021-1.png?width=400", "FLASH|Flash Kids Flosser - Sea Animal Shapes": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Flash_Kids.jpg?width=400", "HiSmile|Glostik Tooth Gloss": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/HiSmile-Glostik_Tooth_Gloss-4ML-93571692-1.png?width=400", "Waterpik|Implant Denture Water Flosser Tip": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Waterpik-Implant_Denture_Water_Flosser_Tip-White-73950278119-1.png?width=400", "HiSmile|Mango Sorbet Toothpaste": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/HiSmile-Mango_Sorbet_Toothpaste-60G-93568654-1.png?width=400", "Silonn|Mini Fridge": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Silonn-Mini_Fridge-White-5070002067894-1.png?width=400", "EverSmile|Ortho Chews with Removal Tool": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/EverSmile-OrthoChews_with_Removal_Tool-810055330058-1.png?width=400", "HiSmile|PAP+ Whitening Powder": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/HiSmile-PAP__Whitening_Powder_-12G-744109218996-1.png?width=400", "HiSmile|PAP+ Whitening Toothpaste": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/HiSmile-PAP__Whitening_Toothpaste_-63G-93571142-1.png?width=400", "HiSmile|Peach Iced Tea Toothpaste": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/HiSmile-Peach_Iced_Tea_Toothpaste-60G-93568593-1.png?width=400", "Beverly Hills Formula|Perfect White Black Remineralisation Repair Whitening Charcoal Toothpaste": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/bh1.jpg?width=400", "Beverly Hills Formula|Perfect White Extreme White Teeth Whitening Toothpaste": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/bh4.jpg?width=400", "Beverly Hills Formula|Perfect White Sensitive Teeth Whitening Toothpaste": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/bh2.jpg?width=400", "Philips|Philips One by Sonicare Battery Toothbrush": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/PHILIP_1_3a0ef8e0-e17e-4954-bc88-10d8e3f0cdb6.png?width=400", "Philips|Philips One by Sonicare Brush Heads": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_ProResults-White-8710103786856-1.png?width=400", "Philips|Philips Sonicare 1100 Series": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philipssonicarecompactflosser1000purple.jpg?width=400", "Philips|Philips Sonicare 2100 Series": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philipssonicarecompactflosser1000purple.jpg?width=400", "Philips|Philips Sonicare C1 ProResults": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_ProResults-White-8710103786856-1.png?width=400", "Philips|Philips Sonicare Compact Flosser 1000 - Blue": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philipssonicarecompactflosser1000purple.jpg?width=400", "Philips|Philips Sonicare Compact Flosser 1000 - Purple": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philipssonicarecompactflosser1000purple.jpg?width=400", "Philips|Philips Sonicare Compact Flosser Replacement Nozzle (Standard & Comfort)": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philipssonicarecompactflosser1000purple.jpg?width=400", "Philips|Philips Sonicare Cordless Power Flosser 2000": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_Cordless_Power_Flosser_2000-White-8720689011051-1.png?width=400", "Philips|Philips Sonicare Diamond Clean 9000 Series Special Edition - Blue": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips_DC_Blue.jpg?width=400", "Philips|Philips Sonicare Diamond Clean 9000 Series Special Edition - Purple": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips_DC_Blue.jpg?width=400", "Philips|Philips Sonicare DiamondClean 9000": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_DiamondClean_9000-Black-8710103981336-1.png?width=400", "Philips|Philips Sonicare F1 Standard Nozzle": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_ProResults-White-8710103786856-1.png?width=400", "Philips|Philips Sonicare F3 Quad Stream Nozzle": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_F3_Quad_Stream_Nozzle-White-8710103953241-1.png?width=400", "Philips|Philips Sonicare ProtectiveClean 4300": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_ProtectiveClean_4300-Black-8710103894070-1.png?width=400", "Philips|Philips Sonicare Rechargeable Toothbrush 1100 Series": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_1100_Series-White-8710103985426-1.png?width=400", "Philips|Philips Sonicare Rechargeable Toothbrush 2100 Series": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_2100_Series-Light_Blue-8710103985495-1.png?width=400", "Philips|Philips Sonicare Rechargeable Toothbrush 5300 Series": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_ProResults-White-8710103786856-1.png?width=400", "Philips|Philips Sonicare S2 Sensitive": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_S2_Sensitive-White-8720689021050-1.png?width=400", "Philips|Philips Sonicare W2 Optimal White": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Philips-Philips_Sonicare_W_DiamondClean-Black-8710103849698-1.png?width=400", "Philips|Philips Tooth Brush - Travel Case": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/2_ea960c89-8653-40d7-b125-a6e22397ad89.png?width=400", "HiSmile|Red Velvet Toothpaste": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/HiSmile-Red_Velvet_Toothpaste-60G-93571074-1.png?width=400", "FLASH|Teeth Whitening Strips": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/FLASH-Teeth_Whitening_Strips-6939548131119-1.png?width=400", "TePe|Tepe Dental Floss Waxed Mint": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TEPE_2_1.jpg?width=400", "TePe|TePe EasyFit - M/L": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TEPE_EASYFIT_1.jpg?width=400", "TePe|TePe EasyFit - S/M": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TEPE_EASYFIT_2.jpg?width=400", "TePe|TePe Implant Care Kit": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TePeImplantCareKit.jpg?width=400", "TePe|TePe Mini Flosser": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/22.jpg?width=400", "TePe|TePe Original Black (1.5 mm) Interdental Brush": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TePe-TePe_Original_Black__1.5_mm__Interdental_Brush-7317400015620-1.jpg?width=400", "TePe|TePe Original Blue (0.6 mm) Interdental Brush": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TePe-TePe_Original_Blue__0.6_mm__Interdental_Brush-7317400011776-1.jpg?width=400", "TePe|TePe Original Grey (1.3 mm) Interdental Brush": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TePe-TePe_Original_Grey__1.3_mm__Interdental_Brush-7317400015590-1.jpg?width=400", "TePe|TePe Original Orange (0.45 mm) Interdental Brush": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TePe-TePe_Original_Orange__0.45_mm__Interdental_Brush-7317400011714-1.jpg?width=400", "TePe|TePe Original Pink (0.4 mm) Interdental Brush": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TePe-TePe_Original_Pink__0.4_mm__Interdental_Brush-7317400011684-1.jpg?width=400", "TePe|TePe Original Red (0.5 mm) Interdental Brush": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TePe-TePe_Original_Red__0.5_mm__Interdental_Brush-7317400002064-1.jpg?width=400", "TePe|TePe Original Yellow (0.7 mm) Interdental Brush": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/TePe-TePe_Original_Yellow__0.7_mm__Interdental_Brush-7317400011806-1.jpg?width=400", "TePe|TePe Orthodontic Kit": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/IMG_6413.jpg?width=400", "FLASH|Tongue Scraper with Travel Pouch": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/FLASH-Tongue_Scraper_with_Travel_Pouch-Pink-71221740023-1.png?width=400", "Waterpik|Ultra Professional Water Flosser": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Waterpik-Aquarius_Water_Flosser-White-73950210195-1.png?width=400", "Ultramed|Ultramed Gift Box - For Packaging": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/Ultramed-Gift_Box_For_Packaging-77_0001-1.png?width=400", "UNDO|Undo Microneedle Pimple Patches": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/UNDO-MICRO_NEW.jpg?width=400", "UNDO|Undo Nose Patches": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/UNDO-NOSE_PATCH_1.jpg?width=400", "UNDO|Undo Pimple Patches": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/UNDO-MICRO_NEW.jpg?width=400", "UNDO|Undo Skin Essentials Bag": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/UNDO00.jpg?width=400", "HiSmile|V34 Color Corrector Foam": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/HiSmile-V34_Color_Corrector_Foam-45ML-754590176842-1.png?width=400", "HiSmile|V34 Colour Corrector Serum": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/HiSmile-V34_Colour_Corrector_Serum-30ML-744109218965-1.png?width=400", "HiSmile|Watermelon Toothpaste": "https://cdn.shopify.com/s/files/1/0438/3575/2606/files/HiSmile-Watermelon_Toothpaste-60G-93568609-1.png?width=400"};
// The Intensiv catalog entries carry the manufacturer's photos (bundled in img/deck/p).
INTENSIV_PRODUCTS.forEach(p => { if(p.img) PRODUCT_IMG_SEED['Intensiv|' + p.name] = p.img; });
async function applyProductImgSeed(){
  if(currentUser.role !== 'supervisor') return;
  if(_loadFailed.products || _mirrorUsed.products) return;
  let changed = 0;
  products.forEach(pr => {
    if(pr.img) return;
    const u = PRODUCT_IMG_SEED[(pr.brand||'') + '|' + pr.name];
    if(u){ pr.img = u; changed++; }
  });
  if(!changed) return;
  await persist('products');
  showToast(`🖼️ ${changed} product photos added`);
}
// One-time orphan sweep, at the supervisor's request: any DELETED clinic the
// team still has logged visits for comes back automatically — visits mean it
// is a real working clinic, so its deletion was a cleanup accident. Clinics
// with no visits at all stay deleted (that cleanup was intentional), and the
// sweep runs once ever, so future deliberate deletes are respected.
async function restoreOrphanClinics(){
  if(currentUser.role !== 'supervisor') return;
  if((erpSales.seeds || {}).orphanRestore_v58) return;
  const keys = ['clinics','visits','erpSales'];
  if(keys.some(k => _loadFailed[k] || _mirrorUsed[k])) return; // only on a real cloud read
  const live = new Set(clinics.map(c=>c.id));
  const orphans = {}; // id -> {visits:[], name, repCount}
  visits.forEach(v=>{
    if(!v.clinicId || live.has(v.clinicId)) return;
    const o = orphans[v.clinicId] || (orphans[v.clinicId] = { n:0, name:'', reps:{} });
    o.n++;
    if(!o.name && v.clinicName) o.name = v.clinicName;
    if(v.rep) o.reps[v.rep] = (o.reps[v.rep]||0)+1;
  });
  const ids = Object.keys(orphans);
  const restored = [];
  ids.forEach(id=>{
    const o = orphans[id];
    // the recycle bin may still remember it better than the visits do
    const b = ((recycleBin && recycleBin.clinics)||[]).find(x=>x && x.id===id);
    const name = (b && b.name) || o.name || '⚠️ Restored clinic — rename me';
    const rep = (b && b.rep) || Object.keys(o.reps).sort((a,b2)=>o.reps[b2]-o.reps[a])[0] || REPS[0] || '';
    clinics.push(normalizeClinic(Object.assign({}, b || {}, {
      id, name, rep, cls: (b && b.cls) || 'B', addedOn: todayStr(),
      notes: ((b && b.notes) ? b.notes + ' · ' : '') + 'Auto-restored (had ' + o.n + ' logged visits)',
    })));
    untomb('clinics', id);
    restored.push(name);
  });
  erpSales.seeds = Object.assign({}, erpSales.seeds, { orphanRestore_v58: true });
  if(restored.length){
    recycleBin.clinics = (recycleBin.clinics||[]).filter(x=>!(x && orphans[x.id]));
    await persist('clinics');
    await persist('recycleBin');
  }
  await persist('erpSales');
  if(restored.length){
    renderAll();
    showModal(`
      <h3 style="margin-top:0;">♻️ ${restored.length} deleted clinic${restored.length===1?'':'s'} restored automatically</h3>
      <p style="color:var(--muted); font-size:13px; margin-top:-6px;">These clinics still had logged visits, so they are back with their full history. Clinics with no visits stayed deleted.</p>
      <div class="card">${restored.map(n=>`<div class="report-line"><span>${esc(n)}</span><span class="v">✅</span></div>`).join('')}</div>
      <button class="btn" style="margin-top:12px;" onclick="closeModal()">Done</button>
    `);
  }
}
// One-time automatic recovery from the Aug-30 clinic wipe, at the supervisor's
// request ("do the restore yourself"): on his next open, if the live clinic
// list is drastically smaller than a recent automatic backup, the best backup
// day is restored by itself — no buttons. Backup versions win on shared ids
// (the wipe left stale/junk copies); clinics that only exist in the live list
// (added after the backup) are kept; the delete log is cleared for everything
// restored so it STICKS. Runs once ever, only on real cloud reads, and does
// nothing at all when the list is healthy.
async function autoRestoreWipe(){
  if(currentUser.role !== 'supervisor') return;
  if((erpSales.seeds || {}).autoRestore_v64) return;
  const keys = ['clinics','visits','erpSales'];
  if(keys.some(k => _loadFailed[k] || _mirrorUsed[k])) return; // only on a real cloud read
  let best = null;
  try{
    const list = await window.storage.list('snap_', true);
    const dates = (list && list.keys || []).map(k=>k.replace('snap_','')).sort().reverse().slice(0, 12);
    for(const d of dates){
      const res = await window.storage.get('snap_'+d, true).catch(()=>null);
      const snap = res ? UMCore.safeParse(res.value, null) : null;
      const n = snap && Array.isArray(snap.clinics) ? snap.clinics.length : 0;
      if(n >= 15 && (!best || n > best.n)) best = { d, n, snap };
    }
  }catch(e){ return; } // backups unreachable — try again next open, keep the flag unset
  const wiped = best && (_seedClinics || clinics.length < best.n / 3);
  if(!wiped){
    // Evaluated healthy with good reads: mark done so a future legitimately-
    // small list (a real cleanup) can never trigger a surprise rollback.
    erpSales.seeds = Object.assign({}, erpSales.seeds, { autoRestore_v64: true });
    await persist('erpSales');
    return;
  }
  try{ await holdRefresh(async () => { // a refresh on its way must not put the wiped lists back over this restore
    const snapClinics = normalizeClinics(best.snap.clinics);
    const byId = new Map(snapClinics.map(c=>[c.id, c]));
    const extras = _seedClinics ? [] : clinics.filter(c => c && c.id != null && !byId.has(c.id));
    clinics = snapClinics.concat(extras);
    _seedClinics = false;
    const restoredMsg = [`${clinics.length} عيادة`];
    const sets = { clinics: clinics.map(c=>c.id) };
    // Visits only if they were hit too — never roll back a healthy visit log.
    const snapVisits = Array.isArray(best.snap.visits) ? best.snap.visits : [];
    if(snapVisits.length >= 15 && visits.length < snapVisits.length / 3){
      const haveV = new Set(visits.map(v=>v && v.id));
      visits = visits.concat(snapVisits.filter(v => v && !haveV.has(v.id)));
      sets.visits = visits.map(v=>v.id);
      restoredMsg.push(`${visits.length} زيارة`);
    }
    await untombMany(sets); // clear the delete log FIRST or the restore un-does itself
    { const str = JSON.stringify(clinics); await window.storage.set('clinics', str, true); mirrorSave('clinics', str); setMergeBase('clinics', str); }
    if(sets.visits) await persistVisits({ authoritative: true });
    // Today's automatic snapshot may have caught the wiped state — replace it
    // with the recovered one so no bad copy sits in the backup window.
    await window.storage.set('snap_'+todayStr(), JSON.stringify({clinics: storedClinics(), products, visits: UMCore.visitsPartition(visits, todayStr()).live, tasks, ts: new Date().toISOString()}), true).catch(()=>{});
    erpSales.seeds = Object.assign({}, erpSales.seeds, { autoRestore_v64: true });
    await persist('erpSales'); // flag only AFTER success — a failure retries next open
    console.log(`auto-restore: recovered from snap_${best.d}`, restoredMsg.join(', '));
    renderAll();
    showModal(`
      <h3 style="margin-top:0;">✅ رجعت العيادات</h3>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.7;">تم الاسترجاع تلقائيًا من النسخة الاحتياطية ليوم <b>${esc(best.d)}</b>:
      <b>${restoredMsg.join(' · ')}</b>. أي عيادة أُضيفت بعد النسخة بقيت كما هي، والحذف الخاطئ أُلغي نهائيًا فلن تختفي مرة أخرى.</p>
      <button class="btn" onclick="closeModal()">تمام</button>
    `);
  }); }catch(e){ console.error('auto-restore failed, will retry next open', e); }
}
// Clinics without a name and doctors met on a visit whose record is gone
// from the clinic (most lost in the August–September incidents). v121 (the
// owner's rules of 12 Nov: zero data loss, no automatic merges, no change to
// the shared data without someone's tap): nothing is written at start. What
// this phone still holds is offered as a SUGGESTION on the "Clinics without
// a name" and "Doctors without a name" sheets (07-clinics.js), and the owner
// or the supervisor taps to use it: the copy kept before the big August
// change (um_mirror_prev:clinics) and the last copy seen (um_mirror:clinics).
// Local data only, nothing downloaded.
function phoneCopyLists(){
  const out = [];
  ['um_mirror_prev:clinics', 'um_mirror:clinics'].forEach(k => {
    let arr = null; try{ arr = UMCore.safeParse(localStorage.getItem(k), null); }catch(e){}
    if(Array.isArray(arr)) out.push(arr);
  });
  return out;
}
// id → the real (named) record of a clinic this phone kept, older copy first
function phoneCopyClinics(){
  const real = new Map();
  phoneCopyLists().forEach(arr => arr.forEach(c => {
    if(c && c.id != null && c.name && !isPlaceholderClinic(c) && !real.has(c.id)) real.set(c.id, c);
  }));
  return real;
}
// "clinicId|doctorId" → a doctor record with a name this phone kept
function phoneCopyDoctors(){
  const docs = new Map();
  phoneCopyLists().forEach(arr => arr.forEach(c => (c && Array.isArray(c.doctors) ? c.doctors : []).forEach(d => {
    if(d && d.id != null && d.name && !docs.has(c.id + '|' + d.id)) docs.set(c.id + '|' + d.id, d);
  })));
  return docs;
}
// Second recovery pass after the Aug-30 wipe: the single-day restore brought
// most things back, but records missing from that one day and clinics revived
// as "⚠️ Restored clinic — rename me" placeholders remained. This sweep unions
// EVERY backup day (newest copy of each record wins), skips anything the team
// deliberately deleted (recycle bin + delete log), and renames placeholders
// from the best surviving source: a backup copy, the name stamped on its
// visits, or the recycle bin. Runs once, supervisor only, real reads only.
async function deepRestoreSweep(){
  if(currentUser.role !== 'supervisor') return;
  if((erpSales.seeds || {}).deepRestore_v65) return;
  if(['clinics','visits','erpSales'].some(k => _loadFailed[k] || _mirrorUsed[k])) return;
  try{
    const bestById = new Map(), visById = new Map();
    const list = await window.storage.list('snap_', true);
    const dates = (list && list.keys || []).map(k=>k.replace('snap_','')).sort(); // oldest → newest, newer wins
    for(const d of dates){
      const res = await window.storage.get('snap_'+d, true).catch(()=>null);
      const snap = res ? UMCore.safeParse(res.value, null) : null;
      if(!snap) continue;
      (Array.isArray(snap.clinics)?snap.clinics:[]).forEach(c=>{ if(c && c.id != null) bestById.set(c.id, c); });
      (Array.isArray(snap.visits)?snap.visits:[]).forEach(v=>{ if(v && v.id != null) visById.set(v.id, v); });
    }
    const isPlaceholder = n => /rename me/i.test(n || '');
    const binC = (recycleBin && recycleBin.clinics) || [];
    const binIds = new Set(binC.map(x=>x && x.id));
    const haveC = new Set(clinics.map(c=>c && c.id));
    const addedC = [];
    bestById.forEach((c, id)=>{
      // deliberate deletes stay deleted: recycle bin (30 days) + delete log (7 days)
      if(haveC.has(id) || binIds.has(id) || tombSet('clinics').has(id)) return;
      clinics.push(c); addedC.push(c.name || id);
    });
    const renamed = [];
    clinics.forEach(c=>{
      if(!c || !isPlaceholder(c.name)) return;
      const snapC = bestById.get(c.id);
      let nm = (snapC && !isPlaceholder(snapC.name) && snapC.name) || null;
      if(!nm){ const sv = visits.find(v=>v && v.clinicId===c.id && v.clinicName && !isPlaceholder(v.clinicName)); nm = sv && sv.clinicName; }
      if(!nm){ const b = binC.find(x=>x && x.id===c.id); nm = (b && !isPlaceholder(b.name) && b.name) || null; }
      if(!nm) return;
      renamed.push(nm);
      c.name = nm;
      // a placeholder was reborn bare — refill anything the backup copy still knows
      if(snapC) ['rep','cls','phone','contact','account','dealType','doctors','profileNotes','noSaleReason','notes'].forEach(k=>{
        const empty = c[k] == null || c[k] === '' || (Array.isArray(c[k]) && !c[k].length);
        if(empty && snapC[k] != null) c[k] = snapC[k];
      });
    });
    const haveV = new Set(visits.map(v=>v && v.id));
    let addedV = 0;
    visById.forEach((v, id)=>{
      if(haveV.has(id) || tombSet('visits').has(id)) return;
      visits.push(v); addedV++;
    });
    clinics = normalizeClinics(clinics);
    const changed = addedC.length || renamed.length || addedV;
    if(changed){
      await persist('clinics');
      await persist('visits');
    }
    erpSales.seeds = Object.assign({}, erpSales.seeds, { deepRestore_v65: true });
    await persist('erpSales');
    if(changed){
      renderAll();
      showModal(`
        <h3 style="margin-top:0;">🧩 اكتمل الترميم العميق</h3>
        <div class="card" style="padding:10px 12px;">
          ${addedC.length?`<div class="spec-row"><span class="k">عيادات ناقصة رجعت من كل النسخ الاحتياطية</span><span class="v">${addedC.length}</span></div>`:''}
          ${renamed.length?`<div class="spec-row"><span class="k">عيادات "rename me" استعادت اسمها الحقيقي</span><span class="v">${renamed.length}</span></div>`:''}
          ${addedV?`<div class="spec-row"><span class="k">زيارات ناقصة رجعت</span><span class="v">${addedV}</span></div>`:''}
        </div>
        ${renamed.length?`<div style="max-height:140px; overflow:auto; margin-top:8px; font-size:12px; color:var(--muted);">${renamed.map(esc).join(' · ')}</div>`:''}
        <p style="color:var(--muted); font-size:12px; margin-top:8px;">ما حذفتموه بأنفسكم بقي محذوفًا — سلة المحذوفات وسجل الحذف يُحترمان.</p>
        <button class="btn" onclick="closeModal()">تمام</button>
      `);
    }
  }catch(e){ console.error('deep restore failed, will retry next open', e); }
}
let _loadFailed = {}; // docs whose LAST read rejected — a failed read is not an empty account
let _mirrorUsed = {}; // docs served from the local mirror (offline) — never authoritative
// ---- ERP sales: split storage (index document + row-chunk documents) ----
// Every uploaded period's rows used to sit inside ONE cloud document. A month
// of invoice lines is ~250 KB, so that document outgrew what a phone can read
// or write inside the save timeouts (and headed for the cloud's hard 1 MB
// cap): the boot read fell back to the local mirror, the next import was
// refused as "refreshed elsewhere" — and the screen still said "✅ imported".
// Now the index is a few hundred bytes and each period's rows live in their
// own chunk documents (UMCore.erpSplitForStorage), read in parallel. The
// local mirror always keeps the fully ASSEMBLED copy so offline screens keep
// their sales figures. Legacy accounts (rows inline) read as before and are
// split on their next save.
let _erpStored = new Set(); // chunk documents known to exist in the cloud
let _erpBroken = [];        // period ids whose rows could not be read this session (shown, retryable — never a silent blank)
let _erpDirty = false;      // in-memory sales changes the cloud has NOT confirmed (shown as a retry pill)
const ERP_CHUNK_READ_MS = 15000;
let ERP_WRITE_MS = 45000; // one atomic commit for chunks + index
const ERP_ORPHAN_GRACE_MS = 7 * 86400000; // an unreferenced chunk is deleted only after this long — a week, so a deleted or replaced file can still be restored from a daily backup
// The same salesman can appear under two spellings in the ERP ("Mariam
// Sample" / "Mariam  Sample" / a middle name added): overlap decisions key
// on the REP the name maps to, or on the normalized name when unmapped —
// never on the raw string.
function erpSalesmanKey(name, repMap){
  const m = Object.assign({}, (erpSales && erpSales.repMapGlobal) || {}, repMap || {});
  const rep = m[name];
  if(rep) return 'rep:' + rep;
  return 'sm:' + String(name || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
}
function erpOverlapKeys(){
  return { keyOf: (row, p) => erpSalesmanKey(row[8], p && p.repMap), nameKey: (name, p) => erpSalesmanKey(name, p && p.repMap) };
}
async function erpFetchChunks(keys, timeoutMs){
  const docs = {};
  const got = await Promise.all(keys.map(k => withTimeout(window.storage.get(k, true), timeoutMs || ERP_CHUNK_READ_MS)
    .then(r => [k, r ? UMCore.safeParse(r.value, null) : null]).catch(() => [k, null])));
  got.forEach(([k, v]) => { if(Array.isArray(v)) docs[k] = v; });
  return docs;
}
// Fill unreadable periods from a previous assembled mirror copy: the very same
// revision is taken as-is; the same period at ANOTHER revision (the cloud's
// chunks for the current one are gone — e.g. deleted by a stale device) is
// taken too, re-stamped so the next save writes it back as fresh chunks, and
// counted in _erpPutBack so the supervisor is offered that save (erpAdoptLoaded).
// Returns the ids still missing.
let _erpPutBack = 0; // periods the last loadErpSales put back from this phone's copy
function erpFillFromMirror(sales, prevMirror){
  const exact = {}, byId = {};
  ((prevMirror && prevMirror.periods) || []).forEach(p => { if(p && Array.isArray(p.rows) && p.rows.length){ exact[UMCore.erpRowsKey(p)] = p.rows; byId[p.id] = p; } });
  let recovered = 0;
  sales.periods.forEach(p => {
    if(!p.rowsMissing || !p.rowsRef) return;
    const rows = exact[p.rowsRef.key];
    if(rows && (p.rowsRef.count == null || rows.length === p.rowsRef.count)){ p.rows = rows; delete p.rowsMissing; return; }
    const older = byId[p.id];
    if(older){ p.rows = older.rows; p.rowCount = older.rows.length; p.net = older.net != null ? older.net : p.net; p.rev = Date.now(); delete p.rowsMissing; recovered++; }
  });
  if(recovered){ _erpPutBack += recovered; console.warn(`erpSales: ${recovered} period(s) recovered from this device's copy — save to put them back in the cloud`); }
  return sales.periods.filter(p => p.rowsMissing).map(p => p.id);
}
// The mirror must never silently vanish when the phone's storage is full:
// keep everything if it fits, else only the last four months' rows, else the
// bare index (the app then shows the "rows not loaded" warning offline).
function erpMirrorSave(sales){
  if(mirrorSave('erpSales', JSON.stringify(sales))) return true;
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const slim = Object.assign({}, sales, { periods: (sales.periods || []).map(p => (p && p.to && p.to < cutoff && p.rowsRef) ? (() => { const q = Object.assign({}, p); delete q.rows; return q; })() : p) });
  if(mirrorSave('erpSales', JSON.stringify(slim))) return true;
  return mirrorSave('erpSales', JSON.stringify(UMCore.erpSplitForStorage(sales).index));
}
// ---- Visits: one LIVE document (this month) + one ARCHIVE document per past month ----
// The whole visit log used to be one cloud document — the same shape that
// broke the sales file: a hard 1 MB cap, growing with every visit and every
// photo thumbnail. Now the current month lives in `visits`, every past month
// in `visitsArch:YYYY-MM`, and `visitsIndex` lists the months. The app still
// holds ONE list in memory (assembled here), so every screen is unchanged.
// Saving rules: a document is written with a union merge (never loses), a
// visit whose date moved it to another month is shed from its old document
// only once its new home provably holds it, and a month that could not be
// read this session is never written. An old app version that writes the
// whole list back into `visits` is harmless: the next save re-homes it.
let _visitsLive = [];        // the live document as last read / written
let _visitsLoaded = null;    // JSON of that live array (change detection)
let _visitsArch = {};        // month → { rev, arr, json } as last read / written (json = change detection; the objects are shared with the list on screen)
let _visitsBroken = [];      // months whose archive could not be read (never written, shown as a warning)
let _visitsSaving = false;   // a save in flight: the refresh keeps its hands off the list
let _visitsListed = false;   // the one-time archive listing for accounts without an index
let _visitsSaveChain = Promise.resolve();
function visitsMirrorSave(all){
  if(mirrorSave('visits', JSON.stringify(all))) return true;
  // device storage full: keep this quarter so the offline screen still has it
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const ok = mirrorSave('visits', JSON.stringify((all || []).filter(v => v && (!v.date || v.date >= cutoff))));
  if(ok) _deviceStale.visits = true; // a partial copy: a queued list is served from memory, not from it
  return ok;
}
function visitsArchivesObj(){ const o = {}; Object.keys(_visitsArch).forEach(m => { o[m] = _visitsArch[m].arr; }); return o; }
async function loadVisits(){
  if(_visitsSaving) return visits; // never swap the list underneath a save
  const gen0 = _localGen; // a save that runs while this reads makes what it read older than memory (v121)
  const today = todayStr();
  if(outboxHas('visits')){
    if(_deviceStale.visits){ _mirrorUsed.visits = true; return visits; } // its device copy is older than memory (a full phone)
    const mm = UMCore.safeParse(mirrorGet('visits'), undefined);
    if(Array.isArray(mm)){ _mirrorUsed.visits = true; return mm; } // queued offline edits win until flushed
  }
  let liveRes, idxRes;
  try{
    [liveRes, idxRes] = await Promise.all([
      withTimeout(window.storage.get('visits', true), 8000),
      withTimeout(window.storage.get('visitsIndex', true), 8000).catch(() => null),
    ]);
  }catch(e){
    if(_deviceStale.visits){ _mirrorUsed.visits = true; return visits; } // the device copy is older than memory (a full phone)
    const m = UMCore.safeParse(mirrorGet('visits'), null);
    if(Array.isArray(m)){ _mirrorUsed.visits = true; return m; }
    _loadFailed.visits = true;
    return [];
  }
  const liveArr = liveRes && liveRes.value != null ? (UMCore.safeParse(liveRes.value, null) || []) : [];
  const index = idxRes && idxRes.value != null ? (UMCore.safeParse(idxRes.value, null) || {}) : {};
  let months = Object.keys(index.months || {});
  if((!idxRes || idxRes.value == null) && !_visitsListed){
    // no index yet (legacy account, or its write failed): look for archives once per session
    _visitsListed = true;
    try{ const l = await withTimeout(window.storage.list(UMCore.VISITS_ARCH_PREFIX, true), 8000); months = (l && l.keys || []).map(k => k.slice(UMCore.VISITS_ARCH_PREFIX.length)); }catch(e){}
  }
  Object.keys(_visitsArch).forEach(m => { if(!months.includes(m)) months.push(m); });
  const broken = [], got = {};
  await Promise.all(months.map(async m => {
    const rev = (index.months && index.months[m] && index.months[m].rev) || 0;
    const have = _visitsArch[m];
    if(have && have.rev === rev) return; // unchanged since last read / written by this device
    try{
      const r = await withTimeout(window.storage.get(UMCore.visitsArchKey(m), true), 8000);
      const arr = r && r.value != null ? (UMCore.safeParse(r.value, null) || []) : [];
      got[m] = { rev, arr, json: JSON.stringify(arr) };
    }catch(e){ if(!have) broken.push(m); } // an earlier copy is kept; a month never read is flagged
  }));
  // A visits save ran meanwhile: what this read brought back is older than
  // the list in memory and than what that save recorded as stored — keep
  // both; the next refresh reads again.
  if(_bootLoaded && savedSince(gen0)){ console.warn('visits: a save ran while this refresh read — the list on screen is kept'); return visits; }
  Object.assign(_visitsArch, got);
  _visitsBroken = broken;
  _visitsLive = liveArr;
  _visitsLoaded = JSON.stringify(liveArr);
  const order = v => (v && v.ts) || (v && v.date ? new Date(v.date + 'T00:00:00').getTime() : 0);
  const all = UMCore.visitsAssemble(liveArr, visitsArchivesObj(), today).sort((a, b) => order(a) - order(b)); // the same chronological order the single document had
  // If the assembled log arrives FAR smaller than what this device saw last
  // time, keep the old copy aside — it may be the only surviving one.
  const prevRaw = mirrorGet('visits'), prev = UMCore.safeParse(prevRaw, null);
  if(Array.isArray(prev) && prev.length >= 10 && all.length < prev.length / 3){ try{ localStorage.setItem('um_mirror_prev:visits', prevRaw); }catch(e){} }
  visitsMirrorSave(all);
  renderVisitsNudge();
  return all;
}
function renderVisitsNudge(){
  const el = document.getElementById('visitsNudge');
  if(!el) return;
  if(!_visitsBroken.length){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = `<div class="card" style="border-inline-start:4px solid var(--amber); margin-bottom:12px;">
    <div style="font-weight:700; font-size:13.5px;" dir="auto">⚠️ زيارات ${_visitsBroken.map(m => esc(m)).join('، ')} لم تُحمَّل من السحابة</div>
    <div style="color:var(--muted); font-size:12.5px; margin-top:2px;" dir="auto">التقارير لهذه الأشهر ناقصة مؤقتًا. الحفظ يعمل ولن يلمس هذه الأشهر.</div>
    <button class="chip small" style="margin-top:8px;" onclick="retryVisitsArchives()">🔄 إعادة المحاولة</button>
  </div>`;
}
async function retryVisitsArchives(){
  const all = await loadVisits();
  if(!_visitsSaving){ visits = all.filter(v => !(v && tombSet('visits').has(v.id))); renderAll(); }
  showToast(_visitsBroken.length ? '⚠️ ما زالت بعض الأشهر غير متاحة' : '✅ حُمِّلت كل الزيارات');
}
// One save at a time; throws on failure so persist() can queue it offline.
function persistVisits(opts){
  const run = () => persistVisitsInner(opts || {});
  _localGen++; _localSaving++; // a refresh on its way keeps the lists (see persist)
  const p = _visitsSaveChain.then(run, run);
  _visitsSaveChain = p.catch(() => {});
  return p.finally(() => { _localSaving--; _localGen++; });
}
async function persistVisitsInner(opts){
  _visitsSaving = true;
  try{
    const today = todayStr();
    if(!opts.authoritative) await refreshTombs();
    const ts = tombSet('visits');
    const local = (visits || []).filter(v => v && !ts.has(v.id));
    const part = UMCore.visitsPartition(local, today);
    const homeById = {};
    part.live.forEach(v => { if(v.id != null) homeById[v.id] = 'live'; });
    Object.keys(part.months).forEach(m => part.months[m].forEach(v => { if(v.id != null) homeById[v.id] = m; }));
    const stored = new Set(); // "doc|id" pairs the cloud is known to hold
    const note = (doc, arr) => (arr || []).forEach(v => { if(v && v.id != null) stored.add(doc + '|' + v.id); });
    note('live', _visitsLive); Object.keys(_visitsArch).forEach(m => note(m, _visitsArch[m].arr));
    const keyOf = doc => doc === 'live' ? 'visits' : UMCore.visitsArchKey(doc);
    const written = {};
    // The cloud refuses a document above 1 MB. A month can only get there
    // with a great many photos; say so plainly instead of retrying a save
    // that can never land.
    const VISITS_DOC_MAX = 950000;
    // What each transaction committed, as the exact string it wrote (v122).
    // `written` holds the merged objects, which ARE the visits on screen: an
    // edit made while the commit was on its way changed them too, and
    // recording their JSON afterwards counted that edit as stored — the save
    // it started then found nothing to write and still said "saved".
    const writtenStr = {};
    const committedStr = (res, arr) => typeof res === 'string' ? res : JSON.stringify(arr);
    const writeUnion = async (doc, arr) => {
      let merged = arr, tooBig = false;
      const res = await storageUpdate(keyOf(doc), cloudStr => {
        const cloud = cloudStr != null ? UMCore.safeParse(cloudStr, null) : null;
        merged = (!opts.authoritative && Array.isArray(cloud)) ? mergeById('visits', arr, cloud).merged : arr.filter(v => v && !ts.has(v.id));
        const str = JSON.stringify(merged);
        if(str.length > VISITS_DOC_MAX){ tooBig = true; return null; }
        return str;
      }, 12000);
      if(tooBig){
        showToast(doc === 'live' ? '🛑 زيارات هذا الشهر كبيرة جدًا (صور كثيرة) — احذف بعض الصور من الزيارات ثم أعد المحاولة' : `🛑 زيارات شهر ${doc} كبيرة جدًا — احذف بعض صورها ثم أعد المحاولة`);
        throw new Error('visits document too large: ' + doc);
      }
      if(res == null) throw new Error('visits update failed');
      written[doc] = merged;
      writtenStr[doc] = committedStr(res, merged);
      note(doc, merged);
      return merged;
    };
    // Pass A — union writes of every document this device changed (never loses).
    const dirty = [];
    if(opts.authoritative || JSON.stringify(part.live) !== _visitsLoaded) dirty.push(['live', part.live]);
    Object.keys(part.months).forEach(m => {
      if(_visitsBroken.includes(m)) return; // a month we could not read is never written
      const have = _visitsArch[m];
      if(!have || JSON.stringify(part.months[m]) !== have.json) dirty.push([m, part.months[m]]);
    });
    const overflow = {}; // cloud-only entries found in a document that is not their home
    for(const [doc, arr] of dirty){
      const merged = await writeUnion(doc, arr);
      merged.forEach(v => { if(v && v.id != null && !homeById[v.id]){ const h = UMCore.visitHome(v, today); homeById[v.id] = h; if(h !== doc) (overflow[h] = overflow[h] || []).push(v); } });
    }
    // Pass A2 — re-home what another (older) device left in the wrong document.
    for(const h of Object.keys(overflow)){
      if(h !== 'live' && _visitsBroken.includes(h)) continue;
      const base = written[h] || (h === 'live' ? part.live : (part.months[h] || []));
      const ids = new Set(base.map(v => v && v.id));
      await writeUnion(h, base.concat(overflow[h].filter(v => !ids.has(v.id))));
    }
    // Pass B — tidy: shed a visit from a document once its home provably holds it.
    const docs = new Set(['live', ...Object.keys(_visitsArch), ...Object.keys(written)]);
    for(const doc of docs){
      if(doc !== 'live' && _visitsBroken.includes(doc)) continue;
      const arr = written[doc] || (doc === 'live' ? _visitsLive : _visitsArch[doc].arr);
      const stray = UMCore.visitsStrayIds(doc, arr, homeById, (h, id) => stored.has(h + '|' + id));
      if(!stray.length) continue;
      const drop = new Set(stray);
      let tidy = arr;
      const res = await storageUpdate(keyOf(doc), cloudStr => {
        const cloud = cloudStr != null ? UMCore.safeParse(cloudStr, null) : null;
        tidy = (Array.isArray(cloud) ? cloud : arr).filter(v => v && !drop.has(v.id) && !ts.has(v.id));
        return JSON.stringify(tidy);
      }, 12000);
      if(res == null) throw new Error('visits tidy failed');
      written[doc] = tidy;
      writtenStr[doc] = committedStr(res, tidy);
    }
    // Pass C — the month index (what exists, and a revision per month for cheap refreshes).
    const now = Date.now();
    const writtenMonths = Object.keys(written).filter(d => d !== 'live');
    if(writtenMonths.length || opts.authoritative){
      const owed = Object.keys(_visitsIdxOwed).filter(m => !writtenMonths.includes(m)); // a photo mark patched there: the phones read it again (this one too)
      const res = await storageUpdate('visitsIndex', cloudStr => {
        const idx = (cloudStr != null ? UMCore.safeParse(cloudStr, null) : null) || {};
        idx.months = Object.assign({}, idx.months || {});
        writtenMonths.forEach(m => { idx.months[m] = { n: written[m].length, rev: now }; });
        owed.forEach(m => { idx.months[m] = Object.assign({ n: _visitsIdxOwed[m] }, idx.months[m] || {}, { rev: now }); });
        Object.keys(_visitsArch).forEach(m => { if(!idx.months[m]) idx.months[m] = { n: _visitsArch[m].arr.length, rev: _visitsArch[m].rev || now }; });
        idx.v = 1; idx.updated = now;
        return JSON.stringify(idx);
      }, 12000);
      if(res == null) throw new Error('visits index failed');
      writtenMonths.forEach(m => { _visitsArch[m] = { rev: now, arr: written[m], json: writtenStr[m] }; });
      writtenMonths.concat(owed).forEach(m => { delete _visitsIdxOwed[m]; });
    }
    if(written.live){ _visitsLive = written.live; _visitsLoaded = writtenStr.live; }
    // Memory: this device's list in its own order, plus what other devices
    // added (recovered by the unions), minus what the delete log removed.
    const cloudAll = UMCore.visitsAssemble(_visitsLive, visitsArchivesObj(), today);
    const cloudIds = new Set(cloudAll.map(v => v && v.id));
    const mine = local.filter(v => cloudIds.has(v.id) || _visitsBroken.includes(homeById[v.id]));
    const haveIds = new Set(mine.map(v => v.id));
    // A visit added on this phone while this save was on its way is not in
    // what it wrote: it stays (v121) — the save it started runs next and
    // writes it. Dropped here, that save found nothing to write and still
    // said "saved" (a background save — a photo's "uploaded" mark, the
    // queue's flush — made it likely).
    const took = new Set(local.map(v => v.id));
    const later = (visits || []).filter(v => v && v.id != null && !took.has(v.id) && !ts.has(v.id) && !haveIds.has(v.id));
    later.forEach(v => haveIds.add(v.id));
    visits = mine.concat(later, cloudAll.filter(v => v && !ts.has(v.id) && !haveIds.has(v.id)));
    visitsMirrorSave(visits);
    return true;
  }finally{ _visitsSaving = false; }
}
// Settle photo marks on visits the cloud holds, and nothing else (v122):
// when a photo lands its visit stops saying "waiting to upload" (or, for a
// photo lost before it uploaded, says so) — that one mark, in the document
// that holds the visit, in one transaction. Saving the whole list instead
// wrote this phone's copy of every visit back over the cloud: an edit made on
// another phone meanwhile (notes, a photo added or removed) was undone. Runs
// in the visits save chain, so it never overlaps a save of this phone's list.
// changes: [{ visitId, photoId, lost }] → { [photoId]: 'done' (the cloud's
// copy is settled) | 'missing' (no such visit or photo in the cloud) |
// 'failed' (not reached — asked again next round) }.
// The document the cloud last showed holding a visit, else where it belongs now.
function visitDocOf(id){
  if((_visitsLive || []).some(v => v && v.id === id)) return 'live';
  const m = Object.keys(_visitsArch).find(k => (_visitsArch[k].arr || []).some(v => v && v.id === id));
  if(m) return m;
  const v = (visits || []).find(x => x && x.id === id);
  return v ? UMCore.visitHome(v, todayStr()) : 'live';
}
// Months whose archive this phone changed (a photo mark) while the revision in
// the index that tells the phones to read it again has not moved yet: moved at
// the next round (a failed index write was only logged — the other phones
// kept "waiting to upload" until that month was written again).
const _visitsIdxOwed = {};   // month → its visit count when patched
function visitsIndexOwed(){ return Object.keys(_visitsIdxOwed).length; }
async function bumpVisitsIndex(){
  const months = Object.keys(_visitsIdxOwed);
  if(!months.length) return true;
  const now = Date.now();
  try{
    const res = await storageUpdate('visitsIndex', cloudStr => {
      const idx = (cloudStr != null ? UMCore.safeParse(cloudStr, null) : null) || {};
      idx.months = Object.assign({}, idx.months || {});
      months.forEach(m => { idx.months[m] = Object.assign({ n: _visitsIdxOwed[m] }, idx.months[m] || {}, { rev: now }); });
      Object.keys(_visitsArch).forEach(m => { if(!idx.months[m]) idx.months[m] = { n: _visitsArch[m].arr.length, rev: _visitsArch[m].rev || now }; });
      idx.v = 1; idx.updated = now;
      return JSON.stringify(idx);
    }, 12000);
    if(res == null) throw new Error('visits index failed');
    months.forEach(m => { delete _visitsIdxOwed[m]; });
    return true;
  }catch(e){ console.warn('visits index (photo mark)', e); return false; } // asked again next round
}
function patchVisitPhotos(changes){
  const out = {}, todo = [];
  // a month that could not be read is never written: those wait, untouched,
  // for a round where it loaded (and never hold up the refresh meanwhile)
  (changes || []).forEach(c => { const d = visitDocOf(c.visitId); if(d !== 'live' && _visitsBroken.includes(d)) out[c.photoId] = 'failed'; else todo.push(c); });
  if(!todo.length){
    if(!visitsIndexOwed()) return Promise.resolve(out);
    const bump = () => bumpVisitsIndex().then(() => out); // the index only: no visit changes, the refresh is not held
    const q = _visitsSaveChain.then(bump, bump);
    _visitsSaveChain = q.catch(() => {});
    return q;
  }
  const run = () => patchVisitPhotosNow(todo).then(r => Object.assign(out, r));
  _localGen++; _localSaving++; // a refresh on its way keeps the lists (see persist)
  const p = _visitsSaveChain.then(run, run);
  _visitsSaveChain = p.catch(() => {});
  return p.finally(() => { _localSaving--; _localGen++; });
}
async function patchVisitPhotosNow(changes){
  const out = {};
  if(!changes.length) return out;
  _visitsSaving = true;
  try{
    const byDoc = {};
    changes.forEach(c => { const d = visitDocOf(c.visitId); (byDoc[d] = byDoc[d] || []).push(c); });
    const settleIn = (arr, list, res) => { // → whether anything changed; res[photoId] = 'done' | 'missing'
      let changed = false;
      list.forEach(c => {
        const v = arr.find(x => x && x.id === c.visitId);
        const p = v && Array.isArray(v.photos) ? v.photos.find(x => x && x.id === c.photoId) : null;
        if(!p){ if(res) res[c.photoId] = 'missing'; return; }
        if(res) res[c.photoId] = 'done';
        if(UMCore.settlePhotoMark(p, c.lost)) changed = true;
      });
      return changed;
    };
    for(const doc of Object.keys(byDoc)){
      const list = byDoc[doc];
      if(doc !== 'live' && _visitsBroken.includes(doc)){ list.forEach(c => { out[c.photoId] = 'failed'; }); continue; } // a month we could not read is never written
      const key = doc === 'live' ? 'visits' : UMCore.visitsArchKey(doc);
      let res = {}, wrote = false, asked = false, n = 0;
      try{
        await storageUpdate(key, cloudStr => {
          res = {}; wrote = false;
          const arr = cloudStr != null ? UMCore.safeParse(cloudStr, null) : null;
          if(!Array.isArray(arr)){ list.forEach(c => { res[c.photoId] = 'missing'; }); return null; }
          n = arr.length;
          wrote = settleIn(arr, list, res);
          if(wrote) asked = true; // never reset: a later run of the same transaction finds it settled
          return wrote ? JSON.stringify(arr) : null; // nothing to change → nothing written
        }, 12000);
      }catch(e){
        list.forEach(c => { out[c.photoId] = 'failed'; });
        if(asked && doc !== 'live') _visitsIdxOwed[doc] = n; // it may have landed with no answer: the phones read it once more
        continue;
      }
      Object.assign(out, res);
      // A month's archive is read again by the phones only when its revision
      // in the index moves (as Pass C does for a save) — this phone too: it
      // never takes the new revision as its own, its copy of the month is not
      // what the cloud now holds (another phone's edit may be in it). Taken,
      // the phone stopped reading the month: other phones' edits never showed
      // and its next save of the month put its old copy back (v122 review).
      // A transaction can run more than once (the cloud's answer lost, then a
      // retry that finds the mark settled): any run that asked to write counts.
      if(asked && doc !== 'live') _visitsIdxOwed[doc] = n;
      // What this phone knows the cloud holds gets the same marks settled, so
      // the next save of the list does not count them as a change of its own.
      const done = list.filter(c => res[c.photoId] === 'done');
      if(!done.length) continue;
      const restring = str => { const arr = typeof str === 'string' ? UMCore.safeParse(str, null) : null; return Array.isArray(arr) && settleIn(arr, done, null) ? JSON.stringify(arr) : str; };
      if(doc === 'live'){ if(_visitsLoaded != null) _visitsLoaded = restring(_visitsLoaded); }
      else if(_visitsArch[doc]) _visitsArch[doc].json = restring(_visitsArch[doc].json);
    }
    await bumpVisitsIndex(); // every month patched (and any still owed) in one write of the index
  }finally{ _visitsSaving = false; }
  return out;
}
async function loadErpSales(){
  const prevMirror = UMCore.safeParse(mirrorGet('erpSales'), null); // assembled copy from last time
  const es = await cloudGet('erpSales');
  const index = Object.assign({periods: []}, UMCore.safeParse(es && es.value, null) || {});
  if(!Array.isArray(index.periods)) index.periods = [];
  const keys = UMCore.erpChunkKeys(index);
  _erpStored = new Set(keys);
  _erpBroken = [];
  // A file's rows never change under their key (a new upload is a new key):
  // the files this phone already holds exactly are not downloaded again —
  // erpFillFromMirror below puts them in from the phone's copy (v119).
  const held = {};
  ((prevMirror && prevMirror.periods) || []).forEach(p => { if(p && Array.isArray(p.rows) && p.rows.length) held[UMCore.erpRowsKey(p)] = p.rows.length; });
  const fetchKeys = UMCore.erpChunkKeys({ periods: index.periods.filter(h => !(h && h.rowsRef && held[h.rowsRef.key] != null && (h.rowsRef.count == null || held[h.rowsRef.key] === h.rowsRef.count))) });
  let docs = {};
  if(fetchKeys.length && !_mirrorUsed.erpSales && !_loadFailed.erpSales) docs = await erpFetchChunks(fetchKeys);
  _erpPutBack = 0;
  const out = UMCore.erpAssemble(index, docs);
  if(out.missing.length) out.missing = erpFillFromMirror(out.sales, prevMirror);
  const assembled = out.sales; // what the cloud holds (plus anything put back above)
  // What is on screen never double-counts a day, whatever the cloud holds
  // (a stale-device write, an old-version import): the invariant runs in
  // memory here too, on every load; the next sales save writes the trimmed
  // copy back. It is derived from the cloud's copy, not an edit of this
  // phone's: it never marks the sales unsaved (that flag used to stop a
  // rep's phone from taking the copy it had just read, and every 20-second
  // refresh after it — v121), and the phone keeps the cloud's copy, so the
  // next refresh downloads nothing it already holds.
  const inv = UMCore.erpEnforceNoOverlap(out.sales, Date.now(), erpOverlapKeys());
  if(inv.changed){ out.sales = inv.sales; console.warn(`erpSales: ${inv.changed} overlapping period(s) trimmed in memory — the next sales save writes them back`); }
  if(out.missing.length){
    // Rows the cloud would not hand over right now: the period stays listed
    // with rowsMissing (its stored chunks are left untouched by any save), the
    // supervisor sees a warning with a retry button — never a silent blank —
    // and a quieter second attempt with a long budget runs by itself.
    _erpBroken = out.missing.slice();
    console.error('erpSales: rows unreadable for periods', out.missing);
    if(prevMirror) mirrorSave('erpSales', JSON.stringify(prevMirror)); // keep the last good assembled copy
    setTimeout(() => { retryErpRows({ quiet: true, timeoutMs: 60000 }).catch(() => {}); }, 1500);
  } else if(!_mirrorUsed.erpSales && !_loadFailed.erpSales){
    erpMirrorSave(assembled); // cloudGet mirrored the bare index — replace it with the assembled copy
  }
  return out.sales;
}
// Take a freshly loaded copy as the one on screen. A file put back from this
// phone's copy is the one thing the cloud lacks: on the supervisor's phone —
// the only one that saves sales files — it is marked unsaved and the red bar
// offers the save; anywhere else it is simply shown, and put back again by
// the next load until the supervisor saves it.
function erpAdoptLoaded(fresh){
  erpSales = fresh;
  if(_erpPutBack && currentUser && currentUser.role === 'supervisor'){ _erpDirty = true; renderErpDirtyPill(); }
}
// Second attempt at the rows that did not download at boot (button in the
// import screen and the warning card, and once automatically after boot).
async function retryErpRows(opts){
  opts = opts || {};
  const heads = erpPeriods().filter(p => p && p.rowsMissing && p.rowsRef)
    .map(p => { const q = Object.assign({}, p); delete q.rows; delete q.rowsMissing; return q; }); // bare headers, like the index holds them
  if(!heads.length){ _erpBroken = []; renderErpNudge(); return true; }
  if(!opts.quiet) showToast('⏳ جارٍ إعادة تحميل سطور المبيعات…');
  const docs = await erpFetchChunks(UMCore.erpChunkKeys({periods: heads}), opts.timeoutMs);
  const asm = UMCore.erpAssemble({periods: heads}, docs);
  const byId = {}; asm.sales.periods.forEach(p => { byId[p.id] = p; });
  erpSales.periods = erpPeriods().map(p => (p && byId[p.id] && !byId[p.id].rowsMissing) ? byId[p.id] : p);
  const before = _erpBroken.length;
  _erpBroken = erpPeriods().filter(p => p && p.rowsMissing).map(p => p.id);
  if(typeof _erpCtxCache !== 'undefined') _erpCtxCache = { key: null, ctx: null };
  if(!_erpBroken.length) erpMirrorSave(erpSales);
  if(!opts.quiet || _erpBroken.length !== before){ renderAll(); renderErpNudge(); }
  if(!opts.quiet) showToast(_erpBroken.length ? `⚠️ ما زالت ${_erpBroken.length} فترة بلا سطور — تحقق من الاتصال أو أعد رفع الملف` : '✅ اكتملت بيانات المبيعات');
  else if(!_erpBroken.length && before) showToast('✅ اكتملت بيانات المبيعات');
  return !_erpBroken.length;
}
// The same for an account link (saveErpLink, 11-erp.js): the screen kept the
// old link when the cloud did not confirm in time, so when the save lands
// after all, the cloud copy is read and every figure follows it. Then the
// change finishes as an in-time one would (elAfterLateLanding): `info.s` is
// the editor's save — its own page finishes it if still on screen, else a
// toast names the account; `info.undo` is an Undo — its new branch goes (or
// the report says why it stays), on its note or in a toast; `info.quiet`: a
// retry of the same change was already confirmed and told — only the figures follow.
async function erpMapReloadFromCloud(info){
  try{
    const r = await withTimeout(window.storage.get('erpMap', true), 8000);
    const v = UMCore.safeParse(r && r.value, null);
    if(!v || typeof v !== 'object' || Array.isArray(v)) return;
    erpMap = v; _erpMapGen++;
    mirrorSave('erpMap', r.value);
    delete _loadFailed.erpMap; delete _mirrorUsed.erpMap; // the cloud copy is in hand
    renderAll();
    if(typeof elAfterLateLanding === 'function' && elAfterLateLanding(info)) return;
    if(info && info.quiet) return;
    showToast('☁️ An account link reached the cloud late — the figures are updated', 6000);
  }catch(e){ console.warn('erpMap reload after a late-landing link save', e); }
}
// A clinic this device just added (a new branch made from the ERP account
// editor) must survive a background refresh whose read of the clinic list
// started before the save landed: loadAll puts it back until a refresh reads
// it from the cloud (or it was deleted meanwhile — then it is let go).
const _clinicsKeep = new Map(); // id → the clinic as saved
function keepClinicOnRefresh(c){ if(c && c.id != null) _clinicsKeep.set(c.id, c); }
function forgetKeptClinic(id){ _clinicsKeep.delete(id); }
function reinsertKeptClinics(prev){
  if(!_clinicsKeep.size) return;
  const ts = tombSet('clinics');
  _clinicsKeep.forEach((c, id) => {
    if(ts.has(id) || clinics.some(x => x && x.id === id)){ _clinicsKeep.delete(id); return; } // removed since, or the cloud has it now
    const mine = (prev || []).find(x => x && x.id === id) || c;                                  // the copy in memory, edits included
    clinics.push(normalizeClinic(Object.assign({}, mine)));
    console.warn('clinics: a refresh read the list before a just-saved clinic landed — kept', id);
  });
}
// A save the app had given up on (timeout) can still land minutes later: the
// screen was rolled back, so the moment it lands the cloud copy is re-read
// and the screen follows it — no stale figures, no duplicate on re-upload
// (the no-overlap invariant makes a repeated file replace, never add).
async function erpReloadFromCloud(){
  try{
    const fresh = await loadErpSales();
    _erpDirty = false;
    erpAdoptLoaded(fresh);
    renderErpDirtyPill();
    if(typeof _erpCtxCache !== 'undefined') _erpCtxCache = { key: null, ctx: null };
    renderAll(); renderErpNudge();
    showToast('☁️ وصل حفظٌ سابق للسحابة بعد تأخير — تم تحديث الشاشة');
  }catch(e){ console.error('erpSales reload after late landing', e); }
}
// One save at a time: a second call (double tap, boot purge racing an import)
// waits for the first instead of interleaving chunk writes and deletes.
let _erpSaveChain = Promise.resolve();
let _erpSaving = false; // a save is in flight — the periodic refresh must not replace erpSales meanwhile
function persistErpSales(){
  const run = _erpSaveChain.then(persistErpSalesNow, persistErpSalesNow);
  _erpSaveChain = run.catch(() => {});
  return run;
}
async function persistErpSalesNow(){
  _erpSaving = true;
  try{ return await persistErpSalesInner(); }
  finally{ _erpSaving = false; }
}
async function persistErpSalesInner(){
  if(_loadFailed.erpSales){
    // The index itself never loaded (cloud unreachable, no mirror): what is on
    // screen is empty, and writing it would erase every uploaded file.
    showToast('⚠️ بيانات المبيعات لم تُحمَّل — أعد فتح التطبيق على اتصال جيد ثم أعد المحاولة');
    _erpDirty = true; renderErpDirtyPill();
    return false;
  }
  try{
    // 1) Merge with the cloud index — read from the SERVER, never the SDK's
    //    cache — so an import made on another device is never lost
    //    (tombstones decide what was deliberately replaced; the higher
    //    revision wins a shared id).
    const cur = await withTimeout(window.storage.get('erpSales', true, { server: true }), 20000);
    const cloudIdx = cur ? UMCore.safeParse(cur.value, null) : null;
    if(cloudIdx && Array.isArray(cloudIdx.periods)){
      UMCore.erpChunkKeys(cloudIdx).forEach(k => _erpStored.add(k)); // the cloud already holds these
      const r = UMCore.erpMergeIndex(erpSales, cloudIdx);
      const heads = r.merged.periods.filter(p => p && !Array.isArray(p.rows) && !p.rowsMissing);
      if(heads.length){
        const docs = await erpFetchChunks(UMCore.erpChunkKeys({periods: heads}));
        const asm = UMCore.erpAssemble({periods: heads}, docs);
        if(asm.missing.length) throw new Error('cloud rows unreadable: ' + asm.missing.join(','));
        const byId = {}; asm.sales.periods.forEach(p => { byId[p.id] = p; });
        r.merged.periods = r.merged.periods.map(p => byId[p.id] || p);
        console.log(`erpSales: took ${heads.length} period(s) from the cloud (imported or updated on another device)`);
      }
      erpSales = r.merged;
    }
    // 2) The no-overlap invariant across everything merged: one salesman, one
    //    day, one period — the newest import wins. Two devices importing the
    //    same week, or a save that landed after the app gave up on it, can
    //    never double-count.
    const inv = UMCore.erpEnforceNoOverlap(erpSales, Date.now(), erpOverlapKeys());
    if(inv.changed){ erpSales = inv.sales; console.log(`erpSales: overlap invariant trimmed ${inv.changed} period(s)`); }
    // 3) Rows that changed without a revision bump still get a fresh chunk key.
    erpSales.periods.forEach(p => {
      if(p && !p.rowsMissing && p.rowsRef && Array.isArray(p.rows) && p.rowsRef.key === UMCore.erpRowsKey(p) && p.rowsRef.count !== p.rows.length) p.rev = Date.now();
    });
    erpSales.savedAt = new Date().toISOString(); // shown as "last confirmed cloud save"
    const now = Date.now();
    const { index, docs } = UMCore.erpSplitForStorage(erpSales);
    // 4) Orphans are deleted in TWO phases: first sighting is only recorded (in
    //    the index, so every device agrees); deletion happens on a later save
    //    once the grace period has passed — a slower device whose index write
    //    still references a chunk therefore never ends up with a dangling
    //    pointer, and a device booting right now still finds every chunk.
    const live = new Set(UMCore.erpChunkKeys(index));
    const orphans = Object.assign({}, erpSales.orphans || {});
    [..._erpStored].forEach(k => { if(!live.has(k) && !(k in orphans)) orphans[k] = now; });
    Object.keys(orphans).forEach(k => { if(live.has(k)) delete orphans[k]; });
    const due = Object.keys(orphans).filter(k => now - orphans[k] > ERP_ORPHAN_GRACE_MS);
    due.forEach(k => { delete orphans[k]; });
    erpSales.orphans = orphans; index.orphans = orphans;
    // 5) ONE atomic commit: the chunks the cloud lacks + the index. All land or
    //    none. If the app gives up waiting but the commit lands later, the
    //    screen re-reads the cloud the moment it does.
    const entries = Object.keys(docs).filter(k => !_erpStored.has(k)).map(k => [k, JSON.stringify(docs[k])]);
    entries.push(['erpSales', JSON.stringify(index)]);
    const commit = window.storage.setMany
      ? window.storage.setMany(entries)
      : (async () => { for(const [k, v] of entries.slice(0, -1)) await window.storage.set(k, v, true); return window.storage.set('erpSales', entries[entries.length - 1][1], true); })();
    try{ await withTimeout(commit, ERP_WRITE_MS); }
    catch(e){
      if(/timeout/.test(String(e && e.message))) commit.then(() => { _erpSaveChain = _erpSaveChain.then(erpReloadFromCloud, erpReloadFromCloud); }).catch(() => {});
      throw e;
    }
    entries.forEach(([k]) => { if(k !== 'erpSales') _erpStored.add(k); });
    const refs = {}; index.periods.forEach(p => { refs[p.id] = p.rowsRef; });
    erpSales.periods.forEach(p => { if(p && refs[p.id]) p.rowsRef = refs[p.id]; });
    erpMirrorSave(erpSales);
    if(outboxHas('erpSales')) outboxRemove('erpSales');
    delete _mirrorUsed.erpSales;
    _erpDirty = false; renderErpDirtyPill();
    // 6) Orphans past their grace period — best effort, after the index is safe.
    due.forEach(k => { window.storage.delete(k, true).then(() => _erpStored.delete(k)).catch(() => {}); });
    return true;
  }catch(e){
    console.error('erpSales save failed', e);
    _erpDirty = true; renderErpDirtyPill();
    offlineToast('📴 لم يُحفظ ملف المبيعات — تحقق من الاتصال وأعد المحاولة');
    return false;
  }
}
// A change the cloud has not confirmed is never left invisible: a fixed pill
// says so and retries the save on tap (imports roll back instead, see
// erpSaveFailed — the pill is for the small edits: who-is-who, return policy,
// the boot-time purge of ignored salesmen).
function renderErpDirtyPill(){
  let el = document.getElementById('erpDirtyPill');
  if(!_erpDirty){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'erpDirtyPill';
    el.style.cssText = 'position:fixed; top:44px; left:50%; transform:translateX(-50%); z-index:9999; background:#B3261E; color:#fff; font-size:11.5px; font-weight:700; padding:6px 14px; border-radius:99px; box-shadow:0 2px 10px rgba(0,0,0,.25); cursor:pointer;';
    el.onclick = async () => { el.textContent = '⏳ جارٍ الحفظ…'; const ok = await persist('erpSales'); if(ok) showToast('✅ حُفظت تغييرات المبيعات'); else renderErpDirtyPill(); };
    document.body.appendChild(el);
  }
  el.textContent = '⚠️ تغييرات المبيعات غير محفوظة — اضغط لإعادة المحاولة';
}
// Undo buffer for an import that could not be saved: the screen must never
// show figures the cloud does not hold.
function erpStateSnapshot(){ return { periods: erpPeriods().slice(), repMapGlobal: Object.assign({}, erpSales.repMapGlobal || {}), removed: Object.assign({}, erpSales.removed || {}) }; }
function erpStateRestore(s){ erpSales.periods = s.periods; erpSales.repMapGlobal = s.repMapGlobal; erpSales.removed = s.removed; _erpDirty = false; renderErpDirtyPill(); }
function erpTombstone(id){ if(!id) return; erpSales.removed = Object.assign({}, erpSales.removed || {}); erpSales.removed[id] = Date.now(); }
// The stored data reaches further than the file being uploaded (last week's
// export picked by mistake after this week's): returns the stored end date so
// the caller can ask before rolling the figures back.
function erpOlderThanStored(t, salesmen){
  const names = new Set(salesmen || []);
  let newest = null;
  erpPeriods().forEach(p => {
    if(!p || p.rowsMissing) return;
    if(!(p.from <= t.to && p.to >= t.from)) return;
    if(!unpackErpRows(p.rows).some(r => names.has(r.salesman))) return;
    if((p.to || '') > (t.to || '') && (!newest || p.to > newest)) newest = p.to;
  });
  return newest;
}
let _seedClinics = false; // no clinic list was read: what is on screen is not the account's (never saved over it)
let _bootCrashed = false; // loadAll hit an error — state may be partial, never snapshot it
// One read rule everywhere: cloud first (with a timeout); a key with queued
// offline edits prefers the LOCAL mirror (it is newer than the cloud until the
// outbox flushes); an unreachable cloud falls back to the mirror.
// `src` (optional, v122): src.cloud is set true only when the cloud answered
// THIS call. _mirrorUsed / _loadFailed are session-wide — another read of the
// same key can set or clear them while this one is on its way (loadTeam).
async function cloudGet(key, src){
  if(outboxHas(key)){
    if(_deviceStale[key]){ const mem = memoryCopy(key); if(mem != null){ _mirrorUsed[key] = true; return { value: mem }; } } // its device copy is older than memory (a full phone)
    const mm = mirrorGet(key);
    if(mm != null && UMCore.safeParse(mm, undefined) !== undefined){
      _mirrorUsed[key] = true; // offline edits win until flushed — but never authoritative
      return { value: mm };
    }
  }
  try{
    // The sales index is tiny after the split but a legacy (un-split) account
    // still carries ~250 KB inline — give that one read more room, so the
    // migration can happen from a slow phone too.
    const r = await withTimeout(window.storage.get(key, true), key === 'erpSales' ? 20000 : 8000);
    if(src) src.cloud = true;
    if(r && r.value != null && key === 'erpSales') return r; // loadErpSales mirrors the ASSEMBLED copy, never the bare index
    if(r && r.value != null){
      // If the cloud copy of a core list arrives FAR smaller than what this
      // device saw last time, keep the old copy aside before overwriting the
      // mirror — it may be the only surviving copy of a wiped list.
      if(key === 'clinics' || key === 'visits'){
        const prevRaw = mirrorGet(key);
        const prev = UMCore.safeParse(prevRaw, null), next = UMCore.safeParse(r.value, null);
        if(Array.isArray(prev) && Array.isArray(next) && prev.length >= 10 && next.length < prev.length / 3){
          try{ localStorage.setItem('um_mirror_prev:'+key, prevRaw); }catch(e){}
        }
      }
      mirrorSave(key, r.value);
    }
    return r;
  }catch(e){
    if(src) src.cloud = false;
    if(_deviceStale[key]){ const mem = memoryCopy(key); if(mem != null){ _mirrorUsed[key] = true; return { value: mem }; } } // the device copy is older than memory (a full phone)
    const m = mirrorGet(key);
    if(m != null){ _mirrorUsed[key] = true; return { value: m }; }
    _loadFailed[key] = true;
    return null;
  }
}
async function loadAll(){
  try{
    const mapGen0 = _erpMapGen; // a link saved while this read runs is newer than what it brings back
    const rxGen0 = _rxTypesGen; // likewise a prescription-types save
    const gen0 = _localGen, lf0 = _loadFailed, mu0 = _mirrorUsed, seed0 = _seedClinics; // likewise any list saved here (v121)
    dropQueuedErpMap();        // before cloudGet: a queued key would make it serve this device's stale copy
    _loadFailed = {};
    _mirrorUsed = {};
    _seedClinics = false;
    _bootCrashed = false;
    const g = cloudGet;
    const [c,p,v,t,dp,st,rb,bm,ev,tg,cg,es,em,en,rt] = await Promise.all([
      g('clinics'),
      g('products'),
      loadVisits(), // live month + archived months, assembled (see persistVisits)
      g('tasks'),
      g('dayPlans'),
      g('staff'),
      g('recycleBin'),
      g('benchmarks'),
      g('events'),
      g('targets'),
      g('categoryGuides'),
      loadErpSales(), // index document + row chunks, assembled (see persistErpSales)
      g('erpMap'),
      g('erpNotes'),
      g('rxTypes'), // the supervisor's prescription types — read only; never seeded, never written from here
      refreshTombs(), // the team's delete log, read alongside the lists so a deleted record never reaches the screen
    ]);
    // Each key parses independently: one corrupt entry falls back alone instead
    // of throwing and resetting every collection to seed data.
    const notDeleted = key => { const ts = tombSet(key); return x => !(x && ts.has(x.id)); };
    // A list saved here while these reads were on their way (v121): what came
    // back is older than memory. Assigned, the older copy showed — and the
    // next save of that list wrote it over the cloud. Every list stays as it
    // is on screen, with the read flags it was loaded under, and goes back
    // into the phone's copy (the read overwrote it); the next refresh reads again.
    const raced = _bootLoaded && savedSince(gen0);
    if(raced){
      console.warn('refresh: a save ran while it read — the lists on screen are kept; the next refresh reads again');
      Object.keys(LOCAL_KEYS).forEach(k => { if(lf0[k]) _loadFailed[k] = true; else delete _loadFailed[k]; if(mu0[k]) _mirrorUsed[k] = true; else delete _mirrorUsed[k]; });
      _seedClinics = seed0;
      const onPhone = (k, val) => { if(!lf0[k]) mirrorSave(k, JSON.stringify(val)); }; // never defaults over a real copy
      if(!seed0) onPhone('clinics', storedClinics());
      if(!lf0.visits) visitsMirrorSave(visits);
      onPhone('products', products); onPhone('tasks', tasks); onPhone('dayPlans', dayPlans); onPhone('events', events);
      onPhone('targets', targets); onPhone('staff', staff); onPhone('recycleBin', recycleBin); onPhone('benchmarks', BENCHMARKS);
      onPhone('categoryGuides', categoryGuides); onPhone('erpNotes', erpNotes);
      // that copy may hold an edit whose save is still on its way: keep beside it the base the
      // cloud last confirmed, so a reopen without a connection still counts the edit as this phone's
      ['clinics', 'tasks', 'events'].forEach(k => { if(!lf0[k] && !(k === 'clinics' && seed0)) keepMergeBaseOnPhone(k); });
    }
    const clinicsDoc = UMCore.safeParse(c && c.value, null);
    const clinicsBefore = clinics;
    if(!raced){
    // No clinic list ships with the app (the code is public, v121): an account
    // without one starts empty and builds it (Admin → Manage clinics → Import,
    // or Territory → Upload a clinic distribution).
    clinics = normalizeClinics((clinicsDoc || []).filter(notDeleted('clinics')).map(dropTombedDoctors));
    _seedClinics = !clinicsDoc; // nothing read — never allowed to overwrite live data
    if(clinicsDoc) reinsertKeptClinics(clinicsBefore); // a branch saved while this read was on its way stays
    products = UMCore.safeParse(p && p.value, null) || PRODUCTS_SEED;
    assignProductKeys();
    if(!_visitsSaving) visits = (Array.isArray(v) ? v : []).filter(notDeleted('visits'));
    tasks = UMCore.safeParse(t && t.value, []).filter(notDeleted('tasks'));
    dayPlans = UMCore.safeParse(dp && dp.value, {});
    if(!_loadFailed.dayPlans && !_mirrorUsed.dayPlans && !outboxHas('dayPlans')) _dpBase = JSON.stringify(dayPlans); // what the cloud held when we loaded — the base of the next three-way merge
    events = UMCore.safeParse(ev && ev.value, []).filter(notDeleted('events'));
    // The base of the next three-way merge: a real read is exactly what the
    // screen now shows; a key waiting in the queue keeps what the cloud last
    // confirmed (kept on the phone when it was queued — a reopened phone).
    [['clinics', c], ['tasks', t], ['events', ev]].forEach(([k, r]) => {
      if(!_loadFailed[k] && !_mirrorUsed[k]){ setMergeBase(k, r && r.value != null ? r.value : null); if(!outboxHas(k)) dropMergeBaseOnPhone(k); }
      else if(outboxHas(k)) mergeBaseFromPhone(k);
      // read from the phone's copy (offline start, or the read failed) and nothing queued:
      // that copy is what this phone last saw the cloud hold — the base, so the next save
      // never puts back this phone's copy of records it did not touch
      else if(!mergeBaseFor(k) && r && r.value != null){ mergeBaseFromPhone(k); if(!mergeBaseFor(k)) setMergeBase(k, r.value); }
    });
    targets = UMCore.safeParse(tg && tg.value, {});
    // Merge so newly seeded categories appear even for users with a saved copy,
    // while supervisor edits to existing categories win over the seed.
    const cgVal = UMCore.safeParse(cg && cg.value, null);
    categoryGuides = Object.assign({}, JSON.parse(JSON.stringify(CATEGORY_GUIDES_SEED)), cgVal || {});
    } // !raced
    if(_erpSaving || _erpDirty) console.warn('erpSales: refresh skipped — a save is in flight or unsaved edits exist');
    else erpAdoptLoaded(es); // already assembled: periods carry their rows
    // An account link confirmed by the cloud while this read was on its way
    // (or a link save still in flight) is newer than the copy read here: keep
    // it, and keep the device copy on it, instead of showing the old link for
    // a whole refresh cycle.
    if(!_erpLinkSaving && mapGen0 === _erpMapGen) erpMap = UMCore.safeParse(em && em.value, {}) || {};
    else {
      console.warn('erpMap: refresh skipped — an account link was saved while it read');
      mirrorSave('erpMap', JSON.stringify(erpMap));
      delete _loadFailed.erpMap; delete _mirrorUsed.erpMap; // memory holds the copy the cloud confirmed
    }
    if(!raced) erpNotes = UMCore.safeParse(en && en.value, {}) || {};
    // Prescription types: a read that failed keeps what memory had (a fresh
    // phone then shows the built-in forms with a note); a document that does
    // not exist yet is null (the built-in forms); a save confirmed while this
    // read ran is newer than what it brings back.
    if(!_loadFailed.rxTypes){
      if(!_rxSaving && rxGen0 === _rxTypesGen){
        const rtVal = UMCore.safeParse(rt && rt.value, null);
        rxTypesDoc = rtVal && typeof rtVal === 'object' ? rtVal : null;
      } else {
        console.warn('rxTypes: refresh skipped — the list was saved while it read');
        // Memory holds the list the cloud confirmed after this read began; the
        // read itself already wrote its older copy to the device — put the
        // confirmed one back, so the next start without a connection shows it.
        if(rxGen0 !== _rxTypesGen && rxTypesDoc){ mirrorSave('rxTypes', JSON.stringify(rxTypesDoc)); delete _mirrorUsed.rxTypes; }
      }
    }
    if(!_loadFailed.rxTypes) _rxTypesRead = 'read'; else if(_rxTypesRead !== 'read') _rxTypesRead = 'failed';
    if(typeof rxTypesRefreshed === 'function'){ try{ rxTypesRefreshed(); }catch(e){ console.warn('types editor refresh', e); } } // a types editor waiting for the list (10)
    const stVal = raced ? null : UMCore.safeParse(st && st.value, null);
    if(stVal){ staff = stVal; refreshStaff(); }
    const rbVal = raced ? null : UMCore.safeParse(rb && rb.value, null);
    if(rbVal){ recycleBin = Object.assign({clinics:[],products:[],visits:[]}, rbVal); }
    const bmVal = raced ? null : UMCore.safeParse(bm && bm.value, null);
    if(bmVal){ BENCHMARKS = Object.assign({}, BENCHMARKS, bmVal); }
    await loadTeam();
    // Seed a missing doc ONLY when the read genuinely said "empty" — a failed
    // or mirror-served read must never write factory defaults over live data.
    const readOk = k => !_loadFailed[k] && !_mirrorUsed[k];
    // Duplicate doctor records collapsed while normalizing: point the visits
    // at the survivors, and (supervisor, real reads) write the clean lists back.
    const remapped = applyDoctorRemap();
    if(Object.keys(_docRemap).length && currentUser.role === 'supervisor' && readOk('clinics') && readOk('visits')){
      console.log(`doctors: ${Object.keys(_docRemap).length} duplicate record(s) merged, ${remapped} visit(s) re-pointed`);
      await persist('clinics');
      if(remapped) await persist('visits');
    }
    // Recovery runs BEFORE fresh-account seeding: an account that has backup
    // snapshots but no clinic doc is damaged, not new — restore, don't seed.
    await autoRestoreWipe();
    await deepRestoreSweep();
    archiveTargetsMonth(); // a finished month's target/achieved figures are kept, not lost to rollover
    if(_seedClinics && !c && readOk('clinics')) _seedClinics = false; // genuinely fresh account: nothing to write — its first clinic creates the list
    if(!p && readOk('products')) await persist('products');
    if(!st && readOk('staff')) await persist('staff');
    if(!bm && readOk('benchmarks')) await persist('benchmarks');
    if(!cg && readOk('categoryGuides')) await persist('categoryGuides');
    if(currentUser && currentUser.role === 'supervisor' && !_loadFailed.erpSales && !_mirrorUsed.erpSales) await purgeIgnoredSalesmen();
    await applyProductImgSeed();
    await restoreOrphanClinics();
  }catch(e){
    // A late failure (team load, a seed) must NOT throw away collections that
    // already parsed fine — only fill in whatever is still missing.
    console.error('load error', e);
    _bootCrashed = true;
    if(!Array.isArray(clinics) || !clinics.length){ clinics = []; _seedClinics = true; }
    if(!Array.isArray(products) || !products.length) products = PRODUCTS_SEED;
    if(!Array.isArray(visits)) visits = [];
    if(!Array.isArray(tasks)) tasks = [];
    if(!dayPlans || typeof dayPlans !== 'object') dayPlans = {};
    if(!categoryGuides) categoryGuides = JSON.parse(JSON.stringify(CATEGORY_GUIDES_SEED));
  }
  hidePlaceholderClinics();
  // Rep filters default once per sign-in; the background refresh keeps
  // whatever the supervisor has selected (a rep is always pinned to herself).
  if(_filtersFor !== currentUser.name || currentUser.role === 'rep'){
    clinicRepFilter = currentUser.role==='rep' ? currentUser.name : 'all';
    reportRepFilter = currentUser.role==='rep' ? currentUser.name : 'all';
    calRepFilter = currentUser.role==='rep' ? currentUser.name : 'all';
    _filtersFor = currentUser.name;
  }
  renderAll();
  _bootLoaded = true;
  updateSyncBadge();
  checkWipeBanner(); // fire-and-forget: compares against automatic backups
  flushOutbox(); // anything saved offline goes up now, merged with the cloud
}
let _filtersFor = null; // whose sign-in the rep filters were last defaulted for
// ---- SMART MERGE-ON-SAVE ----
// Shared lists are one document each with last-write-wins, so two devices
// saving in the same window could silently drop each other's additions.
// Before saving a shared list we re-read the cloud copy and UNION by id:
// whatever the other device added since our load is kept, our own edits win
// on conflict, and ids we deleted THIS session (tombstones) stay deleted
// instead of being resurrected by the merge. If the pre-read fails we fall
// back to a plain save — never worse than the old behavior.
const MERGE_KEYS = { visits: 'visits', tasks: 'tasks', clinics: 'clinics', events: 'events' };
// ---- OFFLINE LAYER ----
// Mirror: every doc read or written also lands in localStorage, so the app
// has data to show when the cloud is unreachable. Outbox: keys saved while
// offline, flushed through the merge-on-save path the moment we're back
// online (union with the cloud — nothing from either side is lost).
// Tombstones persist across restarts so an offline delete never resurrects.
function withTimeout(pr, ms){
  return Promise.race([pr, new Promise((_, rej)=>setTimeout(()=>rej(new Error('timeout')), ms))]);
}
// ---- A full phone (v121) ----
// The device copies and the queue share the phone's small web storage. When
// it was full, a save "kept in memory only" had lost its queue entry too:
// nothing retried it, and the next refresh put the phone's older copy (or
// the cloud's) over it — the visit vanished. Now the queue also lives in
// memory; a key whose device copy could not be written is served from
// memory, never from that older copy (_deviceStale); before giving up, the
// phone's copy of the sales rows is dropped (the cloud sends them again);
// and what is still only in memory is said by a red bar until it uploads.
const _outboxMem = new Set();
let _outboxDeviceBad = false; // the device queue could not be rewritten: memory is the queue this session
const _deviceStale = {};      // key → its device copy is older than memory
const _memOnly = new Set();   // queued saves the phone could not keep (bar until they upload)
function deviceSet(k, v, mayFree){
  try{ localStorage.setItem(k, v); return true; }catch(e){}
  if(mayFree && freeDeviceRoom()){ try{ localStorage.setItem(k, v); return true; }catch(e){} }
  return false;
}
// Room on a full phone — only a copy the cloud can send again: the rows of
// the sales files this phone holds as the cloud stores them (each file's
// rows stay in the cloud under their key; the next start downloads them).
// Never a copy that may be the only one (a file put back from this phone,
// unsaved sales, the copies kept aside as um_mirror_prev:*).
function freeDeviceRoom(){
  if(_erpDirty || _erpSaving) return false;
  let m = null; try{ m = UMCore.safeParse(localStorage.getItem('um_mirror:erpSales'), null); }catch(e){}
  if(!m || !Array.isArray(m.periods)) return false;
  let freed = 0;
  const periods = m.periods.map(p => {
    if(!p || !Array.isArray(p.rows) || !p.rows.length || p.rowsMissing || !p.rowsRef || p.rowsRef.key !== UMCore.erpRowsKey(p)) return p;
    freed += p.rows.length; const q = Object.assign({}, p); delete q.rows; return q;
  });
  if(!freed) return false;
  try{ localStorage.setItem('um_mirror:erpSales', JSON.stringify(Object.assign({}, m, { periods }))); }
  catch(e){ try{ localStorage.removeItem('um_mirror:erpSales'); }catch(e2){ return false; } }
  console.warn(`device storage full: ${freed} sales rows dropped from this phone's copy — they download again from the cloud`);
  return true;
}
function mirrorSave(key, str){
  if(deviceSet('um_mirror:' + key, str, key !== 'erpSales')){ delete _deviceStale[key]; return true; }
  _deviceStale[key] = true;
  return false;
}
function mirrorGet(key){ try{ return localStorage.getItem('um_mirror:'+key); }catch(e){ return null; } }
function outboxList(){
  let dev = []; if(!_outboxDeviceBad){ try{ dev = JSON.parse(localStorage.getItem('um_outbox')||'[]'); }catch(e){} }
  const out = Array.isArray(dev) ? dev.slice() : [];
  _outboxMem.forEach(k => { if(!out.includes(k)) out.push(k); });
  return out;
}
// The queue is now exactly `list` — in memory always; on the phone if it fits.
function outboxWrite(list){
  _outboxMem.clear(); list.forEach(k => _outboxMem.add(k));
  const str = JSON.stringify(list);
  let ok = deviceSet('um_outbox', str, true);
  if(!ok){
    let dev = null; try{ dev = JSON.parse(localStorage.getItem('um_outbox') || '[]'); }catch(e){}
    // only a list that DROPS a key must replace the phone's one (so a sent key never comes back);
    // one that only adds keys leaves it: removed, a reopen would forget every earlier queued save
    if(!(Array.isArray(dev) && dev.every(k => list.includes(k)))){ try{ localStorage.removeItem('um_outbox'); if(list.length) localStorage.setItem('um_outbox', str); ok = true; }catch(e){} }
  }
  _outboxDeviceBad = !ok; // an older device queue must not bring back what was sent
  updateSyncBadge();
  return ok;
}
function outboxAdd(key){ const l = outboxList(); if(!l.includes(key)){ l.push(key); return outboxWrite(l); } return !_outboxDeviceBad; }
function outboxRemove(key){ outboxWrite(outboxList().filter(k=>k!==key)); }
function outboxHas(key){ return outboxList().includes(key); }
// What a queued key holds in memory, for the reads that would otherwise
// serve its older device copy.
function memoryCopy(key){
  const v = key === 'clinics' ? storedClinics() : ({ visits, tasks, dayPlans, events, chat: chatMsgs, memories })[key];
  return v === undefined ? null : JSON.stringify(v);
}
const MEMONLY_VISIT = "This phone's storage is full — this visit is only in the app's memory: keep the app open and connected until it says Saved";
const MEMONLY_OTHER = "This phone's storage is full — these changes are only in the app's memory: keep the app open and connected until it says Saved";
// v122: a visit photo kept only in the app's memory (photoKeep → 'mem', 12) is
// on this bar too until it has landed: the visit can reach the cloud before it.
const MEMONLY_PHOTO = "This phone's storage is full — a photo is only in the app's memory: keep the app open and connected until it says Saved";
let _memBarTimer = 0; // while such a photo is on the bar: looked at again every second (it lands in the background)
function memOnlyPhotos(){ return typeof photosToUpload === 'function' ? photosToUpload(true) : 0; }
function renderMemOnlyBar(){
  let el = document.getElementById('memOnlyBar');
  const nPh = memOnlyPhotos();
  clearTimeout(_memBarTimer); _memBarTimer = 0;
  if(!_memOnly.size && !nPh){ if(el) el.remove(); updateSyncBadge(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'memOnlyBar'; el.setAttribute('role', 'alert'); el.setAttribute('data-notr', '');
    el.style.cssText = 'position:fixed; top:10px; left:12px; right:12px; z-index:10001; background:#B3261E; color:#fff; font-size:12.5px; font-weight:700; line-height:1.45; padding:9px 12px; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,.3); text-align:center; pointer-events:none; white-space:pre-line;';
    document.body.appendChild(el);
  }
  const lines = _memOnly.size
    ? [_memOnly.has('visits') ? MEMONLY_VISIT : MEMONLY_OTHER].concat(nPh ? [nPh === 1 ? "A photo is only in the app's memory too" : nPh + " photos are only in the app's memory too"] : [])
    : [nPh === 1 ? MEMONLY_PHOTO : "This phone's storage is full — " + nPh + " photos are only in the app's memory: keep the app open and connected until it says Saved"];
  const txt = lines.map(t => trOf(t) || t).join('\n');
  if(el.textContent !== txt) el.textContent = txt; // an alert: said again only when it changes
  if(nPh) _memBarTimer = setTimeout(memOnlyRecheck, 1000);
  updateSyncBadge();
}
// A save of its own decides while one is on its way (its outcome adds to the bar, or lands below).
function memOnlyRecheck(){ if(_localSaving > 0) _memBarTimer = setTimeout(memOnlyRecheck, 1000); else memOnlyLanded(null); }
// Photos kept only in memory that reached the cloud since the bar last said
// so (photoLanded, 12): a photo removed from its visit leaves the bar too,
// and that is never "Saved — it reached the cloud" (v122 review).
let _memPhotoLanded = 0;
function memOnlyPhotoLanded(){ _memPhotoLanded++; }
// What was only in memory has landed (key: the list just saved; null: a photo,
// rechecked): "Saved" once nothing is left only in the app's memory — and only
// when something did land.
function memOnlyLanded(key){
  const had = key != null && _memOnly.delete(key);
  if(!had && !_memPhotoLanded && !document.getElementById('memOnlyBar')) return;
  renderMemOnlyBar();
  if(_memOnly.size || memOnlyPhotos()){
    // more is left on the bar: a photo that landed is said now — kept for
    // later, the next removal of a photo would have read as "Saved"
    if(_memPhotoLanded){ const n = _memPhotoLanded; _memPhotoLanded = 0; showToast(n === 1 ? '✅ A photo reached the cloud' : '✅ ' + n + ' photos reached the cloud', 4000); }
    return;
  }
  if(!had && !_memPhotoLanded) return; // gone from the bar without landing (removed): nothing to say
  _memPhotoLanded = 0;
  const left = typeof photosToUpload === 'function' ? photosToUpload(false) : 0; // kept on the phone, still on their way
  showToast(left ? '✅ Saved — it reached the cloud · ⏳ ' + photosLeftText(left) : '✅ Saved — it reached the cloud', 5000);
}
// Account links are saved one account at a time with a compare-and-set
// (saveErpLink, 11-erp.js), never as a whole map. A whole-map save waiting in
// the outbox (no version queues one, but a device copy can hold anything) is
// dropped, never replayed: replayed, it would be refused for ever — and while
// it waited, cloudGet would keep serving this device's stale copy of the links.
function dropQueuedErpMap(){
  if(!outboxHas('erpMap')) return false;
  outboxRemove('erpMap');
  console.warn('outbox: a queued whole-map "erpMap" save was dropped — account links are saved per account (saveErpLink)');
  return true;
}
// tombstones: {docKey: {id: deletedAtMs}} kept 7 days
const _tombstones = (()=>{
  const out = { visits:new Set(), tasks:new Set(), clinics:new Set(), events:new Set(), dayPlans:new Set(), doctors:new Set() };
  try{
    const raw = JSON.parse(localStorage.getItem('um_tombs')||'{}');
    const cutoff = Date.now() - 7*86400000;
    // doctor removals are kept for good (v121): after 7 days a removed doctor would
    // otherwise come back as "lost" on the Doctors-without-a-name sheet
    Object.keys(out).forEach(k=>Object.keys(raw[k]||{}).forEach(id=>{ if(k === 'doctors' || raw[k][id] > cutoff) out[k].add(id); }));
  }catch(e){}
  return out;
})();
let tombsDoc = { visits:{}, tasks:{}, clinics:{}, events:{}, dayPlans:{}, doctors:{} };
// Deletes made here that the shared log has not confirmed yet (offline, or a
// write still in flight) — the reconcile below must never drop these.
const _tombsUnpublished = {};
function tomb(key, id){
  if(!_tombstones[key] || id == null) return;
  _tombstones[key].add(id);
  (_tombsUnpublished[key] = _tombsUnpublished[key] || new Set()).add(id);
  try{
    const raw = JSON.parse(localStorage.getItem('um_tombs')||'{}');
    (raw[key] = raw[key] || {})[id] = Date.now();
    localStorage.setItem('um_tombs', JSON.stringify(raw));
  }catch(e){}
  (tombsDoc[key] = tombsDoc[key] || {})[id] = Date.now();
  persistTombs(); // fire-and-forget: share the delete with the whole team
}
// Bringing a record back to life must clear its tombstone EVERYWHERE — the
// in-memory set, this device's durable store, and the team's shared delete
// log — or the next merge/restart would silently delete it again.
function untomb(key, id){
  if(_tombstones[key]) _tombstones[key].delete(id);
  if(_tombsUnpublished[key]) _tombsUnpublished[key].delete(id);
  try{
    const raw = JSON.parse(localStorage.getItem('um_tombs')||'{}');
    if(raw[key] && raw[key][id] != null){ delete raw[key][id]; localStorage.setItem('um_tombs', JSON.stringify(raw)); }
  }catch(e){}
  if(tombsDoc[key]) delete tombsDoc[key][id];
  _untombed[key] = _untombed[key] || new Set(); _untombed[key].add(id);
  persistTombs(); // share the revival like we share deletes
}
const _untombed = {}; // revived ids — the shared log must never re-absorb them
// Bulk revival (a backup restore): clear whole batches from every delete layer
// with ONE shared-log write instead of one per record.
async function untombMany(sets){
  Object.keys(sets).forEach(k=>{
    if(!_tombstones[k]) return;
    const ids = (sets[k]||[]).filter(id=>id!=null);
    ids.forEach(id=>{
      _tombstones[k].delete(id);
      if(_tombsUnpublished[k]) _tombsUnpublished[k].delete(id);
      if(tombsDoc[k]) delete tombsDoc[k][id];
      (_untombed[k] = _untombed[k] || new Set()).add(id);
    });
    try{
      const raw = JSON.parse(localStorage.getItem('um_tombs')||'{}');
      if(raw[k]){ ids.forEach(id=>{ delete raw[k][id]; }); localStorage.setItem('um_tombs', JSON.stringify(raw)); }
    }catch(e){}
  });
  await persistTombs();
}
function absorbTombs(doc){
  Object.keys(_tombstones).forEach(k=>{
    Object.keys((doc||{})[k]||{}).forEach(id=>{
      if(_untombed[k] && _untombed[k].has(id)) return; // revived here — don't re-kill
      _tombstones[k].add(id);
      (tombsDoc[k] = tombsDoc[k] || {})[id] = Math.max(tombsDoc[k][id]||0, doc[k][id]||0);
    });
  });
}
// The shared delete log is itself a UNION document (max timestamp wins, 7-day
// retention) — safe to write from any device at any time, safe to queue.
// Read → union → write as ONE atomic step (v121): it used to read the log,
// then write the whole log back — a phone deleting at the same moment (or a
// write the app gave up on, delivered later by the cloud's client) lost the
// other phone's delete, which that phone then forgot too (reconcileTombs).
async function persistTombs(){
  try{
    let out = null;
    const written = await storageUpdate('tombs', cur => {
      const cloud = cur != null ? (UMCore.safeParse(cur, null) || {}) : {};
      reconcileTombs(cloud); // BEFORE the union: a delete revived elsewhere must not be re-published from our stale copy
      const cutoff = Date.now() - 7*86400000;
      out = {};
      Object.keys(_tombstones).forEach(k=>{
        out[k] = {};
        [cloud[k]||{}, tombsDoc[k]||{}].forEach(src=>Object.keys(src).forEach(id=>{
          if(_untombed[k] && _untombed[k].has(id)) return; // revived — drop from the shared log
          if(k === 'doctors' || (src[id]||0) > cutoff) out[k][id] = Math.max(out[k][id]||0, src[id] || 0); // doctor removals are kept for good (v121)
        }));
      });
      return JSON.stringify(out);
    }, 12000);
    if(written == null) throw new Error('tombs update failed');
    // A delete made here while the write was on its way is not in it: kept
    // (and still unpublished) for the write its own tomb() started.
    const pub = UMCore.safeParse(written, {}) || {};
    Object.keys(tombsDoc || {}).forEach(k => Object.keys(tombsDoc[k] || {}).forEach(id => {
      if(!(_untombed[k] && _untombed[k].has(id)) && !((out[k] = out[k] || {})[id])) out[k][id] = tombsDoc[k][id];
    }));
    tombsDoc = out;
    absorbTombs(out);
    Object.keys(_tombsUnpublished).forEach(k => [..._tombsUnpublished[k]].forEach(id => { if(pub[k] && pub[k][id] != null) _tombsUnpublished[k].delete(id); }));
    if(outboxHas('tombs')) outboxRemove('tombs');
    return true;
  }catch(e){ outboxAdd('tombs'); return false; }
}
// The shared log is the team's truth about deletes. An id THIS device
// tombstoned that is no longer in the log was brought back from the recycle
// bin on another device (or has expired): the local tombstone must go too, or
// this device's next save would silently delete the restored record again —
// and its next persistTombs would even re-publish the delete to everyone.
// Our own deletes that the log has not confirmed yet, and anything younger
// than a minute (a read may predate an in-flight write), are left alone.
function reconcileTombs(cloudDoc){
  const doc = cloudDoc || {};
  const fresh = Date.now() - 60000;
  let raw = null;
  Object.keys(_tombstones).forEach(k=>{
    const inCloud = doc[k] || {};
    const unpub = _tombsUnpublished[k] || new Set();
    [..._tombstones[k]].forEach(id=>{
      if(inCloud[id] != null || unpub.has(id)) return;
      if(((tombsDoc[k]||{})[id] || 0) > fresh) return;
      _tombstones[k].delete(id);
      if(tombsDoc[k]) delete tombsDoc[k][id];
      try{ raw = raw || JSON.parse(localStorage.getItem('um_tombs')||'{}'); if(raw[k]) delete raw[k][id]; }catch(e){}
    });
  });
  if(raw){ try{ localStorage.setItem('um_tombs', JSON.stringify(raw)); }catch(e){} }
}
// Read-only pull of the team's delete log — MUST run before flushing queued
// offline edits, or another device's delete could be resurrected by our flush.
async function refreshTombs(){
  try{
    const cur = await withTimeout(window.storage.get('tombs', true), 5000);
    const doc = cur ? (UMCore.safeParse(cur.value, null) || {}) : {};
    absorbTombs(doc);
    reconcileTombs(doc);
  }catch(e){}
}
// A doctor removed from a clinic (tombstone 'clinicId|doctorId') must not
// come back from a stale copy of the clinic — at load or in a merge.
function dropTombedDoctors(c){
  const dt = _tombstones.doctors;
  if(!c || !dt || !dt.size || !Array.isArray(c.doctors)) return c;
  c.doctors = c.doctors.filter(d => !(d && dt.has(c.id + '|' + d.id)));
  return c;
}
let _flushing = false;
let _stuckTicks = 0;
let _bootLoaded = false;   // flush only with real, loaded state — never factory globals
let _lastOfflineToast = 0;
function offlineToast(msg){
  const now = Date.now();
  if(now - _lastOfflineToast < 60000) return; // once a minute, not per save
  _lastOfflineToast = now;
  showToast(msg);
}
async function flushOutbox(){
  if(_bootLoaded && currentUser && typeof photoReadKeptQuiet === 'function') photoReadKeptQuiet(); // the phone's own photo stores need no signal (12-reports.js)
  if(_flushing || !navigator.onLine || !_bootLoaded || !currentUser) return;
  if(typeof retryPhotos === 'function') retryPhotos(); // photos kept on this phone until the cloud holds them (12-reports.js) — in the background, even with nothing queued
  dropQueuedErpMap(); // never replayed (see dropQueuedErpMap)
  const pending = outboxList();
  if(!pending.length) return;
  _flushing = true;
  let allOk = true;
  const memOnly0 = _memOnly.size; // its own "Saved" toast says it when such a save lands
  try{
    await refreshTombs(); // learn the team's deletes before pushing our queue
    for(const key of pending){
      const ok = key==='tombs' ? await persistTombs()
        : (key==='chat'||key==='memories') ? await persistTeam(key) : await persist(key);
      if(!ok) allOk = false;
    }
  }finally{ _flushing = false; }
  updateSyncBadge();
  // "uploaded" only when nothing is left in the queue: a change made while it uploaded is still waiting (v122)
  if(allOk && pending.length && !memOnly0 && !outboxList().length){
    // v122: a visit's photos upload apart from the queue — the ones still on their way are named, never covered by "uploaded"
    const left = typeof photosToUpload === 'function' ? photosToUpload(false) : 0;
    showToast(left ? '✅ Offline changes uploaded & merged · ⏳ ' + photosLeftText(left) : '✅ Offline changes uploaded & merged', left ? 4500 : undefined);
  }
}
function updateSyncBadge(){
  let el = document.getElementById('syncPill');
  const n = outboxList().length;
  const show = (!navigator.onLine || n > 0) && !_memOnly.size; // the red bar (renderMemOnlyBar) says it all on a full phone
  if(!show){ if(el) el.style.display='none'; return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'syncPill';
    el.style.cssText = 'position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:9999; background:#B8860B; color:#fff; font-size:11.5px; font-weight:700; padding:5px 12px; border-radius:99px; box-shadow:0 2px 10px rgba(0,0,0,.25); pointer-events:none;';
    document.body.appendChild(el);
  }
  el.style.display = 'block';
  el.textContent = !navigator.onLine ? '📴 Offline — saving locally' : `⏳ Uploading offline changes (${n})…`;
}
window.addEventListener('online', ()=>{ updateSyncBadge(); flushOutbox(); });
window.addEventListener('offline', updateSyncBadge);
function tombSet(key){ return _tombstones[key] || new Set(); }
// `base` (optional, v121): Map id → the record as the cloud last confirmed it
// to this phone (mergeBaseFor). With it, a record present on both sides is
// merged field by field (UMCore.merge3Record): what this phone did not change
// takes the cloud's value, so an offline phone's upload no longer undoes what
// another phone changed meanwhile. Without it: this phone's copy wins, as before.
function mergeById(key, local, cloud, base){
  if(!Array.isArray(cloud)) return { merged: local, recovered: 0 };
  const ts = _tombstones[key] || new Set();
  if(base && key === 'clinics') cloud = normalizeClinics(cloud); // compared with the base, which is normalized the same way
  // Deleted ids are dropped from BOTH sides: our own deletes never come back
  // from the cloud, and a stale local copy never resurrects them either.
  const localKept = (local || []).filter(x => !(x && ts.has(x.id)));
  const have = new Set(localKept.map(x => x && x.id));
  let recovered = 0;
  const cloudById = {};
  cloud.forEach(x => { if(x && x.id != null) cloudById[x.id] = x; });
  const fieldMerge = key === 'clinics' ? { doctors: (L, C, B) => { const m = UMCore.mergeDoctorLists3(L, C, B); Object.assign(_docRemap, m.remap); return m.doctors; } } : null;
  const merged = localKept.map(x => {
    const bx = base && x && x.id != null ? base.get(x.id) : null;
    if(!bx || !cloudById[x.id] || typeof UMCore.merge3Record !== 'function') return x; // (an old cached core.js: as before)
    const r = UMCore.merge3Record(x, cloudById[x.id], bx, fieldMerge);
    if(r.fromCloud) recovered++;
    // a doctor the team removed never comes back from the cloud's side of the
    // three-way merge (a stale copy, or a phone still on an older version)
    return key === 'clinics' ? dropTombedDoctors(r.value) : r.value;
  });
  // A photo the cloud already holds stays uploaded (v122): a phone whose copy
  // of the visit still says "waiting to upload" never puts that mark back.
  if(key === 'visits' && typeof UMCore.settlePhotoMarks === 'function') merged.forEach(x => { if(x && cloudById[x.id]) UMCore.settlePhotoMarks(x, cloudById[x.id]); });
  cloud.forEach(x => {
    if(x && x.id != null && !have.has(x.id) && !ts.has(x.id)){ merged.push(x); recovered++; }
  });
  // A clinic's doctors are a shared list: a doctor added on another device
  // is kept (union by id, then by person) instead of being overwritten by
  // this device's older copy of the clinic.
  if(key === 'clinics') merged.forEach(x => {
    const cx = x && cloudById[x.id];
    if(!cx || !Array.isArray(cx.doctors) || !cx.doctors.length) return;
    const before = (x.doctors || []).length;
    const dt = _tombstones.doctors || new Set();
    const m = UMCore.mergeDoctorLists(x.doctors || [], cx.doctors.filter(d => d && !dt.has(x.id + '|' + d.id)));
    x.doctors = m.doctors;
    Object.assign(_docRemap, m.remap);
    if(x.doctors.length !== before) recovered++;
  });
  return { merged, recovered };
}
// ---- The base of the three-way merge (v121): clinics, tasks, events ----
// The list as the cloud last confirmed it to this phone — a real read, or
// the copy this phone wrote — parsed apart from the screen's objects, so an
// edit on screen can never reach it. While the key waits in the offline
// queue it is also kept on the phone (um_base:<key>): a phone reopened before
// the connection came back still merges against what it last saw. No base →
// every record is this phone's copy, exactly as before.
const BASE_KEYS = { clinics: 1, tasks: 1, events: 1 };
const _mergeBase = {}, _mergeBaseStr = {};
function setMergeBase(key, str){
  if(!BASE_KEYS[key]) return;
  const arr = typeof str === 'string' ? UMCore.safeParse(str, null) : null;
  if(!Array.isArray(arr)){ delete _mergeBase[key]; delete _mergeBaseStr[key]; return; }
  const list = key === 'clinics' ? normalizeClinics(arr) : arr;
  _mergeBase[key] = new Map(list.filter(x => x && x.id != null).map(x => [x.id, x]));
  _mergeBaseStr[key] = str;
}
function mergeBaseFor(key){ return (BASE_KEYS[key] && _mergeBase[key]) || null; }
function keepMergeBaseOnPhone(key){ if(BASE_KEYS[key] && _mergeBaseStr[key] != null){ try{ localStorage.setItem('um_base:' + key, _mergeBaseStr[key]); }catch(e){} } }
function dropMergeBaseOnPhone(key){ if(BASE_KEYS[key]){ try{ localStorage.removeItem('um_base:' + key); }catch(e){} } }
function mergeBaseFromPhone(key){
  if(!BASE_KEYS[key] || _mergeBase[key]) return;
  let s = null; try{ s = localStorage.getItem('um_base:' + key); }catch(e){}
  if(s != null) setMergeBase(key, s);
}
// Day plans merge three ways: the lists this device changed since it last
// loaded/saved (_dpBase) win, every other date|rep list takes the cloud's —
// so a clinic removed from a plan on another device stays removed.
let _dpBase = null;
function mergeDayPlans(local, cloud, baseStr){
  const b = baseStr !== undefined ? baseStr : _dpBase; // the base the saved list was taken with (an overlapping save may move _dpBase)
  const base = b ? UMCore.safeParse(b, null) : null;
  return UMCore.mergeDayPlans3(local || {}, cloud || {}, base, _tombstones.dayPlans);
}
// ---- Saves vs the background refresh (v121) ----
// loadAll reads every list at once and assigns them when the slowest read is
// back. A list saved here meanwhile is newer in memory than what came back:
// assigned, the older copy showed — and the next save of that list wrote it
// over the cloud (the change undone, a recycle-bin entry gone for good).
// Every save of a list moves _localGen (before and after) and is counted in
// _localSaving while it runs; a refresh whose read began before the counter
// moved, or that ends while a save runs, keeps every list in memory and puts
// them back in the phone's copy (its read had overwritten it); the next
// refresh reads again. ONE counter for all the lists: a change that saves
// several lists one after another (a delete: the recycle bin, then the list)
// holds the later ones in memory, unsaved, while the first is saving.
// localEdit() marks a change that waits on anything else before its first save.
const LOCAL_KEYS = { clinics: 1, visits: 1, tasks: 1, dayPlans: 1, events: 1, recycleBin: 1, products: 1, targets: 1, staff: 1, benchmarks: 1, categoryGuides: 1, erpNotes: 1 };
let _localGen = 0, _localSaving = 0;
function localEdit(){ _localGen++; }
function savedSince(gen0){ return _localGen !== gen0 || _localSaving > 0; }
// A change that changes lists in memory and then waits on something else
// before or between its writes (a restore: the delete log first, then
// several documents): the refresh is held off for its whole length.
async function holdRefresh(fn){ _localGen++; _localSaving++; try{ return await fn(); } finally{ _localSaving--; _localGen++; } }
async function persist(key, opts){
  if(!LOCAL_KEYS[key]) return persistNow(key, opts);
  _localGen++; _localSaving++;
  try{ const ok = await persistNow(key, opts); if(ok === true) memOnlyLanded(key); return ok; }
  finally{ _localSaving--; _localGen++; }
}
async function persistNow(key, opts){
  opts = opts || {};
  // Account links are saved one account at a time with a compare-and-set
  // (saveErpLink, 11-erp.js). A whole-map write here would silently undo a
  // link another device saved meanwhile — refused, and loudly, so a caller
  // that tries it is caught by the harnesses' console checks.
  if(key === 'erpMap'){ console.error("erpMap is saved per account by saveErpLink — persist('erpMap') refused"); return false; }
  // The prescription types are the supervisor's, saved only by saveRxTypes
  // (10-doctors-products.js) as a compare-and-set — never a blind write, never
  // queued offline, never from a rep's phone.
  if(key === 'rxTypes'){ console.error("rxTypes is saved by saveRxTypes — persist('rxTypes') refused"); return false; }
  // The factory clinic list must never be written over a live account. It can
  // be on screen only because a boot went wrong — saving from that state is
  // exactly how a whole team's list gets destroyed.
  if(key === 'clinics' && _seedClinics && !opts.allowSeed){
    showToast('⚠️ بيانات العيادات لم تُحمَّل بشكل صحيح — أعد فتح التطبيق قبل الحفظ');
    return false;
  }
  if(key === 'erpSales') return persistErpSales(); // split storage: index + row chunks
  const map = {clinics, products, visits, tasks, dayPlans, events, targets, staff, recycleBin, benchmarks: BENCHMARKS, categoryGuides, erpSales, erpMap, erpNotes};
  let value = key === 'clinics' ? storedClinics() : map[key]; // hoisted: the catch mirrors the MERGED copy, not the pre-merge one
  const base0 = mergeBaseFor(key); // the base this list was taken with: an overlapping save of the same list may move it meanwhile
  const dpBase0 = _dpBase;          // likewise for the day plans
  _persistInfo[key] = null;
  // What THIS call did — kept for persistOutcome, and told to its own caller
  // (opts.told, see persistFor): another save of the same key can start before
  // that caller gets to read persistOutcome.
  const tell = info => { _persistInfo[key] = info; if(typeof opts.told === 'function'){ try{ opts.told(info); }catch(e){} } };
  try{
    if(key === 'visits'){
      await persistVisits(opts); // live + archives + index; throws when the cloud is unreachable
      if(outboxHas('visits')) outboxRemove('visits');
      tell({ ok: true });
      if(!Object.keys(_mirrorUsed).length && !_bootCrashed && !_seedClinics) maybeSnapshot();
      return true;
    }
    if(MERGE_KEYS[key] || key === 'dayPlans'){
      // The team's delete log first, so a record another device deleted since
      // our load is dropped from the union instead of being resurrected.
      await refreshTombs();
      // Read → merge → write as ONE atomic step (a transaction where the
      // storage supports it): the merge sees the cloud copy as it is at commit
      // time, so two devices saving within the same second both keep their
      // additions. If the cloud is unreachable we never fall back to a blind
      // overwrite — the save queues in the offline outbox and uploads merged.
      const local = value;
      let refused = false, applied = null;
      const mergeFn = cloudStr => {
        const cloud = cloudStr != null ? UMCore.safeParse(cloudStr, null) : null;
        let v = local;
        if(cloud){
          const r = key === 'dayPlans' ? mergeDayPlans(local, cloud, dpBase0) : mergeById(key, local, cloud, base0);
          v = r.merged;
          // Wipe guard: a merged clinic list SHRINKING far below the cloud copy
          // means something is deleting en masse (poisoned delete log, corrupt
          // state). Refuse — the user must go through Backups, not lose data.
          if(key === 'clinics' && !opts.allowShrink && Array.isArray(cloud) &&
             cloud.length >= 15 && v.length < cloud.length / 3){
            console.error(`clinics save refused: would shrink ${cloud.length} -> ${v.length}`);
            refused = true;
            return null;
          }
          applied = { value: v, recovered: r.recovered };
        } else applied = { value: v, recovered: 0 };
        return JSON.stringify(v);
      };
      const written = await storageUpdate(key, mergeFn, 12000);
      if(refused){
        showToast('🛑 مُنع حفظٌ كان سيحذف معظم العيادات — افتح النسخ الاحتياطية إذا كانت القائمة ناقصة');
        return false;
      }
      if(written == null) throw new Error('update failed');
      value = applied ? applied.value : local;
      // Reflect the merge on screen when it changed anything: entries another
      // device added, or entries it deleted that this device still showed.
      if(applied && (applied.recovered || applied.value.length !== (local||[]).length || (key === 'dayPlans' && JSON.stringify(applied.value) !== JSON.stringify(local)))){
        // reflect the recovered entries in memory so every screen agrees
        if(key === 'visits') visits = value;
        else if(key === 'tasks') tasks = value;
        else if(key === 'clinics'){ clinics = normalizeClinics(value); hidePlaceholderClinics(); }
        else if(key === 'events') events = value;
        else if(key === 'dayPlans') dayPlans = value;
        console.log(`merge-on-save: kept ${applied.recovered} ${key} entr${applied.recovered===1?'y':'ies'} saved by another device`);
      }
      if(key === 'dayPlans') _dpBase = written; // the cloud now holds exactly this
      setMergeBase(key, written); dropMergeBaseOnPhone(key); // likewise for clinics, tasks, events
      mirrorSave(key, written);
      if(outboxHas(key)) outboxRemove(key);
      tell({ ok: true });
      if(['clinics','visits','tasks'].includes(key) && !Object.keys(_mirrorUsed).length &&
         !_bootCrashed && !_seedClinics) maybeSnapshot(); // never snapshot stale or partial state
      return true;
    }
    // A whole-document key this device could not READ (timeout on a fresh
    // phone, no mirror) holds this device's defaults, not the team's data —
    // writing it would replace the team's recycle bin / targets / catalog
    // with an empty one. Re-read first; a bin unions, anything else refuses.
    if(_loadFailed[key]){
      const fresh = await withTimeout(window.storage.get(key, true), 5000); // unreachable → offline path below
      if(fresh && fresh.value != null){
        if(key === 'recycleBin'){
          value = UMCore.mergeRecycleBin(UMCore.safeParse(fresh.value, null), value);
          recycleBin = value;
        } else {
          offlineToast('⚠️ هذه البيانات لم تُحمَّل من السحابة بعد — أعد فتح التطبيق قبل الحفظ');
          return false;
        }
      }
      delete _loadFailed[key];
    }
    // A doc served from the mirror is stale by definition — writing it back
    // over a newer cloud copy is silent data loss. Merge-safe keys are fine
    // (the union above already reconciled); others must re-read first.
    if(_mirrorUsed[key] && !(MERGE_KEYS[key] || key === 'dayPlans')){
      try{
        const fresh = await withTimeout(window.storage.get(key, true), 5000);
        if(fresh && fresh.value != null && JSON.stringify(UMCore.safeParse(fresh.value, null)) !== JSON.stringify(value)){
          offlineToast('⚠️ This data was refreshed elsewhere — reopen the app before saving again');
          return false;
        }
        delete _mirrorUsed[key]; // cloud reachable and identical: safe to write
      }catch(e){ throw e; } // still unreachable -> offline path below
    }
    const str = JSON.stringify(value);
    const res = await withTimeout(window.storage.set(key, str, true), 7000);
    if(!res){ showToast('Save failed, try again'); return false; }
    mirrorSave(key, str);
    if(outboxHas(key)) outboxRemove(key);
    tell({ ok: true });
    return true;
  }catch(e){
    // Cloud unreachable. Merge-safe lists queue for an automatic, union-based
    // upload; whole-document supervisor files do NOT (a delayed overwrite
    // could erase a newer cloud version) — those ask for a manual retry.
    const queueable = MERGE_KEYS[key] || key === 'dayPlans';
    const toSave = (typeof value !== 'undefined' && value !== null) ? value : map[key]; // the MERGED copy when the merge ran
    const mOk = mirrorSave(key, JSON.stringify(toSave));
    let onPhone = mOk;
    if(queueable){
      // Queued even when the device store is full: the copy in memory still
      // uploads the moment the cloud is back — as long as the app stays open.
      onPhone = outboxAdd(key) && mOk; // the queue entry and the copy, both on the phone
      keepMergeBaseOnPhone(key); // what the cloud last confirmed: the upload merges against it, even after a reopen
      if(!onPhone){ _memOnly.add(key); renderMemOnlyBar(); } // the truth stays on screen until it uploads
      updateSyncBadge();
      offlineToast(onPhone ? '📴 Saved on this device — uploads automatically when back online'
                           : '⚠️ Device storage full — kept in memory only: keep the app open until it uploads');
    } else {
      offlineToast(mOk ? '📴 No connection — retry this save when back online'
                       : '⚠️ Device storage full — retry this save when back online');
    }
    tell({ ok: false, queued: !!queueable, mirrored: onPhone });
    return false;
  }
}
// What the last persist(key) actually did — so a screen can tell the user
// the truth ("saved", "saved on this device only", "not saved") instead of
// celebrating a save that never reached anywhere.
const _persistInfo = {};
function persistOutcome(key){ return _persistInfo[key] || { ok: false, queued: false, mirrored: false }; }
// persist(key) with what THAT save did ({ ok, outcome }), read the moment it
// settles. A screen that awaits more work before telling the user (a
// follow-up task, a day plan) must not read persistOutcome later: the outbox
// flush or a refresh can start another save of the same key meanwhile, and
// that one's state (in flight = null, or already uploaded) is not this save's.
function persistFor(key, opts){
  let info = null;
  const told = ok => ({ ok: ok === true, outcome: info || persistOutcome(key) }); // (an early refusal tells nothing: the outcome as it stands then)
  return persist(key, Object.assign({}, opts || {}, { told: x => { info = x; } }))
    .then(told, e => { console.warn('save of ' + key + ' failed', e); return told(false); });
}
// A save that was queued on this device has gone up since — the outbox sent
// it (a later save of the same list carries it, since the list in memory
// holds it): it is saved.
function sentSince(key, r){ return !!r && !r.ok && !!(r.outcome && r.outcome.queued) && !outboxHas(key) && persistOutcome(key).ok === true; }
// Atomic read-merge-write where the storage supports it; a plain (non-atomic)
// read → fn → write otherwise, with the same contract.
async function storageUpdate(key, fn, ms){
  if(typeof window.storage.update === 'function') return withTimeout(window.storage.update(key, fn), ms || 12000);
  const cur = await withTimeout(window.storage.get(key, true), 5000);
  const next = fn(cur ? cur.value : null);
  if(next == null) return null;
  const ok = await withTimeout(window.storage.set(key, next, true), 7000);
  if(!ok) throw new Error('set failed');
  return next;
}
const SNAP_DAY = 'um_snapDay'; // this phone already found or wrote today's backup (v119: no download of it on every start)
async function maybeSnapshot(){
  try{
    const day = todayStr(), key = 'snap_' + day;
    try{ if(localStorage.getItem(SNAP_DAY) === day) return; }catch(e){}
    const existing = await window.storage.get(key, true).catch(()=>null);
    if(existing){ try{ localStorage.setItem(SNAP_DAY, day); }catch(e){} return; } // already snapshotted today
    // The sales index is tiny and its chunks stay in the cloud for a week
    // after being replaced, so the daily backup can restore the sales files too.
    const erpIndex = (!_loadFailed.erpSales && !_mirrorUsed.erpSales && !erpPeriods().some(p => p && p.rowsMissing)) ? UMCore.erpSplitForStorage(erpSales).index : undefined;
    // Visits: this month only — past months sit in their own archive documents
    // (untouched by day-to-day saves), which keeps the backup well under the cap.
    const vp = UMCore.visitsPartition(visits, todayStr());
    const visitsMonths = {}; Object.keys(vp.months).forEach(m => { visitsMonths[m] = vp.months[m].length; });
    await window.storage.set(key, JSON.stringify({clinics: storedClinics(), products, visits: vp.live, visitsMonths, tasks, erpIndex, ts: new Date().toISOString()}), true);
    try{ localStorage.setItem(SNAP_DAY, day); }catch(e){}
    // Keep 12 days: the backups that aged out are deleted by name — listing
    // them would download every backup in full (the cloud has no light listing).
    for(let i = 13; i <= 19; i++){
      const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() - i);
      await window.storage.delete('snap_' + UMCore.localDateStr(d), true).catch(()=>null);
    }
  }catch(e){ console.error('snapshot error', e); }
}

