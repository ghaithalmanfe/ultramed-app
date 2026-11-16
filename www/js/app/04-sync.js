// load / persist, ERP split storage, merge-on-save, offline layer, tombstones
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- LOAD / PERSIST (shared team data) ----
let _docRemap = {}; // merged doctor id → the record it was merged into (the supervisor's taps, clinic.doctorMerges)
const _saveBlocked = new Set(); // lists too large for the cloud whose changes stay queued here, not sent by the round (saveBlocked)
const _tooLarge = {};           // "key" or "visits:YYYY-MM" → { key, month, bytes, kept } — the lasting bar (renderTooLargeBar)
// Queued lists the cloud refused (v123 review): never thrown away — kept on
// this phone and in the queue, but not sent by the 20-second round until it can
// land. 'noAccess': this phone had no access to the team's data (signed out, a
// sign-in that ended) — sent again once the cloud answers it; 'refused': the
// rules' "no" for this login — sent again by a new sign-in, the bar's "Try
// again" or the next start (parkSave, flushOutbox).
const _saveParked = new Map();
// Two records of one doctor are merged only by the supervisor's tap (v123,
// the owner's rule of 12 Nov: no automatic merges — until v122 every phone
// collapsed same-name doctors at start, and the supervisor's phone wrote the
// result back, dropping the second record's phone, role and stage). The merge
// is kept on the clinic (doctorMerges: {mergedId: keptId}); a visit that still
// names the merged record (logged on a phone that was offline then) shows the
// kept one — in memory only, nothing is written at start (mergeDuplicateDoctors,
// 07-clinics.js). Returns how many visits changed.
function doctorMergesRemap(){
  const out = {};
  (clinics || []).forEach(c => { const m = c && c.doctorMerges; if(m && typeof m === 'object' && !Array.isArray(m)) Object.keys(m).forEach(k => { if(typeof m[k] === 'string' && m[k] && m[k] !== k) out[k] = m[k]; }); });
  return out;
}
function applyDoctorRemap(){
  _docRemap = doctorMergesRemap();
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
  // Two records with one name both stay (v123): the supervisor is offered them
  // as a possible duplicate and merges by tap (openDupDoctors, 07-clinics.js).
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
  if(!currentUser || currentUser.role !== 'supervisor') return; // (nobody signed in: signed out while the read ran)
  if(_loadFailed.products || _mirrorUsed.products) return;
  let changed = 0;
  products.forEach(pr => {
    if(pr.img) return;
    const u = PRODUCT_IMG_SEED[(pr.brand||'') + '|' + pr.name];
    if(u){ pr.img = u; changed++; }
  });
  if(!changed) return;
  const r = await persistTold('products');
  saveToast(r, 'products', `🖼️ ${changed} product photos added`); // "added" only when the save landed
}
// The one-time start-up repairs of Aug–Sep (v58 orphan sweep, v64 automatic
// wipe restore, v65 deep restore) are retired (v123): their work was done, and
// they wrote clinics, visits and today's backup at start without anyone's tap
// — an overlapping refresh could disarm their guards and write an older backup
// over the live list. Bringing clinics back is a tap: Export → Automatic
// backups → "Find missing clinics", and the "Clinics without a name" sheet.
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
let _loadFailed = {}; // docs whose read failed for the copy on screen — a failed read is not an empty account
let _mirrorUsed = {}; // docs on screen served from the local mirror (offline) — never authoritative
// Each refresh reads into flags of its own ({failed, mirror}, passed to cloudGet,
// loadVisits and loadErpSales) and they replace the two above only for the
// lists it puts on screen (v123): the save guards always describe what is on
// screen. They used to be emptied when a refresh began, so for as long as its
// reads took a save made from the phone's copy skipped its guard, and a second
// refresh's start disarmed the first one's (the factory catalog written over
// the live one; an old backup restored over the live clinics).
const readFlags = run => run || { failed: _loadFailed, mirror: _mirrorUsed };
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
async function erpFetchChunks(keys, timeoutMs, texts){
  const docs = {};
  const got = await Promise.all(keys.map(k => withTimeout(window.storage.get(k, true), timeoutMs || ERP_CHUNK_READ_MS)
    .then(r => [k, r ? UMCore.safeParse(r.value, null) : null, r && r.value]).catch(() => [k, null])));
  got.forEach(([k, v, text]) => { if(Array.isArray(v)){ docs[k] = v; if(texts && typeof text === 'string') texts[k] = text; } });
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
// `idx` (v126 speed, part 3): the cloud's index text this copy is of — kept beside it (um_copyIdx:erpSales), so an
// early open's files can be found the same by the start's read; undefined keeps the one kept, anything else drops it.
const COPY_IDX_ERP = 'um_copyIdx:erpSales';
function erpMirrorIdx(idx){
  if(idx === undefined) return;
  try{ if(typeof idx === 'string') localStorage.setItem(COPY_IDX_ERP, idx); else localStorage.removeItem(COPY_IDX_ERP); }catch(e){ try{ localStorage.removeItem(COPY_IDX_ERP); }catch(e2){} }
}
function erpMirrorSave(sales, idx){
  erpMirrorIdx(idx === undefined ? undefined : null); // (written again below once the copy has landed)
  const ok = erpMirrorSaveNow(sales);
  if(ok) erpMirrorIdx(idx);
  return ok;
}
function erpMirrorSaveNow(sales){
  if(mirrorSave('erpSales', JSON.stringify(sales))){ mirrorNoteWrite('erpSales', true); return true; }
  mirrorNoteWrite('erpSales', false);
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const slim = Object.assign({}, sales, { periods: (sales.periods || []).map(p => (p && p.to && p.to < cutoff && p.rowsRef) ? (() => { const q = Object.assign({}, p); delete q.rows; return q; })() : p) });
  if(mirrorSave('erpSales', JSON.stringify(slim))) return true;
  return mirrorSave('erpSales', JSON.stringify(UMCore.erpSplitForStorage(sales).index));
}
// ---- Kept on this phone: what does not change under its key (v126) ----
// The phone's web storage holds about 5 MB. On a heavy year the visits copy
// alone fills most of it: the sales rows (3 MB) no longer fitted beside it, so
// every start AND every 20-second round downloaded every sales file again
// (v119's rule — a file's rows never change under their key — lost on such a
// phone), and every start downloaded every past month's visits before it drew
// anything. Both are kept in IndexedDB (a database of its own, apart from the
// photos'): each document exactly as the cloud returned it — its text, the key
// it was read at, and for a month the revision the visits index gave it in the
// same read. Never this phone's merged or edited copy, never a revision this
// phone wrote: the store is written only where a cloud read lands (loadVisits'
// commit, visitsConfirmKeptNow, loadErpSales).
//   erpRows:<file>:<rev>:<n>  a chunk of a sales file: stands in for its read
//                             while the index names that key and the file's
//                             chunks add up to its line count (erpAssemble).
//                             Exact: nothing writes other rows under a key
//                             (v119), so a file from the store IS the cloud's.
//   visitsArch:<month>        a past month: for the SCREEN only, at the start
//                             of a session, while the index read now gives it
//                             the same revision, the copy is under
//                             KEEP_RECHECK_MS old and no delete of a visit is
//                             held (loadVisits). Never evidence of what the
//                             cloud holds (v126 review): the refresh that put it
//                             on screen reads it from the cloud before it ends,
//                             and nothing writes a visits document or decides
//                             from "every month read" before that
//                             (visitsConfirmKept, keptMonthsOnScreen).
// A store that does not open, does not answer in time, was emptied by the
// browser or holds something unreadable is a miss: the cloud is read, as
// before — never "nothing there", never "unchanged". A store that does not
// answer within KEEP_DB_MS is not asked again this session; at a start it is
// waited for only while it is open, or opened on this phone before (um_keepOk,
// as the photos' um_idbOk). Like the phone's other copies (um_mirror:*) it
// stays at a sign-out.
const KEEP_DB_MS = 5000;              // no answer by then: a miss, and the store is not asked again this session
const KEEP_LATE_MS = 1000;            // the cloud's answer is in: an open store (or one that opened here before) gets this much longer
const KEEP_RECHECK_MS = 20 * 3600000; // a kept month older than this (or dated this much ahead of the clock) never stands in: read from the cloud
const KEEP_SEEN = 'um_keepOk';        // the store opened on this phone before
let _keepDbP = null, _keepState = 'idle'; // 'idle' | 'opening' | 'open' | 'dead' (did not answer in time)
function keepSeen(){ try{ return localStorage.getItem(KEEP_SEEN) === '1'; }catch(e){ return false; } }
function keepDead(){ // not asked again this session, and not waited for at the next start
  _keepState = 'dead'; _keepDbP = Promise.resolve(null);
  try{ localStorage.removeItem(KEEP_SEEN); }catch(e){}
}
function keepDb(){
  if(_keepState === 'dead') return Promise.resolve(null);
  if(!_keepDbP){
    _keepState = 'opening';
    let done = false;
    const open = new Promise(res => {
      let rq;
      try{
        if(typeof indexedDB === 'undefined' || !indexedDB) return res(null);
        rq = indexedDB.open('um_keep', 1);
      }catch(e){ return res(null); }
      rq.onupgradeneeded = () => { try{ rq.result.createObjectStore('docs', { keyPath: 'k' }); }catch(e){} };
      rq.onsuccess = () => {
        const db = rq.result;
        if(done){ try{ db.close(); }catch(e){} return res(null); }
        if(!db.objectStoreNames.contains('docs')){ try{ db.close(); indexedDB.deleteDatabase('um_keep'); }catch(e){} return res(null); } // made without its store: started again next time
        db.onversionchange = () => { try{ db.close(); }catch(e){} if(_keepDbP === p){ _keepDbP = null; _keepState = 'idle'; } };
        res(db);
      };
      rq.onerror = rq.onblocked = () => res(null);
    });
    const p = _keepDbP = withTimeout(open, KEEP_DB_MS).then(db => {
      done = true;
      if(_keepDbP !== p) return db;
      if(db){ _keepState = 'open'; try{ localStorage.setItem(KEEP_SEEN, '1'); }catch(e){} }
      else { _keepDbP = null; _keepState = 'idle'; } // it said no at once (no IndexedDB, an error): cheap to ask again
      return db;
    }, () => { done = true; if(_keepDbP === p) keepDead(); return null; });
  }
  return _keepDbP;
}
// One transaction; fn(store) gives a request (its result is the answer) or a function that gives the answer
function keepDo(mode, fn){
  return keepDb().then(db => {
    if(!db) throw new Error('no store');
    return withTimeout(new Promise((res, rej) => {
      let tx, rq;
      try{ tx = db.transaction('docs', mode); rq = fn(tx.objectStore('docs')); }
      catch(e){ if(_keepState === 'open'){ _keepDbP = null; _keepState = 'idle'; } return rej(e); } // closed under it: opened again next time
      tx.oncomplete = () => res(typeof rq === 'function' ? rq() : rq ? rq.result : null);
      tx.onerror = tx.onabort = () => rej(tx.error || new Error('IndexedDB'));
    }), KEEP_DB_MS).catch(e => { if(e && e.message === 'timeout') keepDead(); throw e; });
  });
}
function keptMap(list){ const o = {}; (list || []).forEach(e => { if(e && typeof e.k === 'string' && typeof e.text === 'string') o[e.k] = e; }); return o; }
// Every entry kept under a prefix → { key: entry }; null when the store cannot be read (a miss: the cloud is read)
async function keptAll(prefix){
  try{ return keptMap(await keepDo('readonly', st => st.getAll(IDBKeyRange.bound(prefix, prefix + '￿')))); }catch(e){ return null; }
}
// The entries of these keys only → { key: entry }; null when the store cannot be read
async function keptGet(keys){
  if(!keys.length) return {};
  try{
    return keptMap(await keepDo('readonly', st => { const out = []; keys.forEach(k => { const r = st.get(k); r.onsuccess = () => { if(r.result) out.push(r.result); }; }); return () => out; }));
  }catch(e){ return null; }
}
// The keys kept under a prefix, without their texts; null when the store cannot be read
async function keptKeys(prefix){
  try{ return (await keepDo('readonly', st => st.getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿')))) || []; }catch(e){ return null; }
}
// What the store gave by the time the cloud answered (a miss → {}): a moment more only while the store is open, or
// opened on this phone before and is opening now — a store that is not open is not waited for (v126 review)
function keptBy(p){
  const wait = _keepState === 'open' || (_keepState === 'opening' && keepSeen()) ? KEEP_LATE_MS : 0;
  return Promise.race([p, new Promise(r => setTimeout(() => r(null), wait))]).then(o => o || {});
}
function keepPut(put, drop){
  if(!(put && put.length) && !(drop && drop.length)) return;
  keepDo('readwrite', st => { (put || []).forEach(e => st.put(e)); (drop || []).forEach(k => st.delete(k)); return null; }).catch(() => {});
}
// The store is only a copy of what the cloud holds: when the phone has no room left for a photo that exists only here
// (photoKeep, 12-reports.js), the store gives way — emptied, the next start reads the cloud (v126 review)
function keepClear(){ return keepDo('readwrite', st => st.clear()).then(() => true, () => false); }
// A past month on screen that came from the store and was not read from the cloud this session (v126 review). Sales
// files from the store are the cloud's own rows (exact under their key): they hold nothing back.
function keptMonthsOnScreen(){ return Object.keys(_visitsArch).some(m => _visitsArch[m] && _visitsArch[m].kept != null); }
function keptOnScreen(){ return keptMonthsOnScreen(); }
let _keptForSnap = false; // the daily backup was held back by a kept month: tried again once the months are read (loadAllNow)
// The files of the index this phone keeps whole — every chunk, adding up to the file's line count → { chunk key: rows }
function erpKeptDocs(index, kept, skip){
  const out = {}, files = [];
  (index.periods || []).forEach(h => {
    const ref = h && h.rowsRef;
    if(!ref || !(ref.chunks > 0) || skip(ref) || (Array.isArray(h.rows) && !h.rowsMissing)) return;
    const part = {}; let n = 0;
    for(let i = 0; i < ref.chunks; i++){
      const e = kept[ref.key + ':' + i], rows = e ? UMCore.safeParse(e.text, null) : null;
      if(!Array.isArray(rows)) return;
      part[ref.key + ':' + i] = rows; n += rows.length;
    }
    if(ref.count != null && n !== ref.count) return;
    Object.assign(out, part); files.push(ref.key);
  });
  return { docs: out, files };
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
let _visitsLoaded = null;    // JSON of that live array (change detection; the base of the live document's three-way merge)
let _visitsBaseHash = null;  // id → fingerprint: the base where no document of this session gives one, kept on the phone while queued (v123)
let _visitsBaseText = null;  // the phone's copy taken as that base at a start without a read — parsed only when a save needs it (v123)
let _visitsBaseParsed = null;
let _visitsBaseRecs = null;  // id → the visit as the cloud last confirmed it, for the visits this phone changed while they waited in the queue (um_base:visitsRec, v123 review)
let _visitsBaseMixed = null;
let _visitsDirtyDocs = null; // the documents the last visits save found changed here ('live' / 'YYYY-MM'): only their visits are looked at for a base record
// The base of a visits document that no read or write of this session gave:
// the fingerprints the phone kept — with the whole record for a visit this
// phone changed meanwhile, so a reopen still merges it field by field (v123
// review: a fingerprint alone took the whole visit from this phone, and
// another phone's correction of it was undone) — else the records of its copy at start.
function visitsFallbackBase(){
  if(_visitsBaseHash){
    if(!_visitsBaseRecs || !_visitsBaseRecs.size) return _visitsBaseHash;
    if(!_visitsBaseMixed || _visitsBaseMixed.h !== _visitsBaseHash || _visitsBaseMixed.r !== _visitsBaseRecs){
      const m = new Map(_visitsBaseHash);
      _visitsBaseRecs.forEach((rec, id) => { if(m.get(id) === UMCore.recordHash(rec)) m.set(id, rec); }); // the record IS that fingerprint's visit
      _visitsBaseMixed = { h: _visitsBaseHash, r: _visitsBaseRecs, m };
    }
    return _visitsBaseMixed.m;
  }
  if(typeof _visitsBaseText !== 'string') return null;
  if(!_visitsBaseParsed || _visitsBaseParsed.text !== _visitsBaseText){
    const arr = UMCore.safeParse(_visitsBaseText, null);
    _visitsBaseParsed = { text: _visitsBaseText, map: new Map((Array.isArray(arr) ? arr : []).filter(v => v && v.id != null).map(v => [v.id, v])) };
  }
  return _visitsBaseParsed.map;
}
let _visitsArch = {};        // month → { rev, arr, json } as last read / written (json = change detection; the objects are shared with the list on screen)
let _visitsBroken = [];      // months whose archive could not be read (never written, shown as a warning)
let _visitsSaving = false;   // a save in flight: the refresh keeps its hands off the list
let _visitsListed = false;   // the one-time archive listing for accounts without an index
let _visitsSaveChain = Promise.resolve();
function visitsMirrorSave(all, text, had){
  const str = typeof text === 'string' ? text : JSON.stringify(all);
  if(typeof had === 'string' && had === str && !_deviceStale.visits){ mirrorNoteWrite('visits', true); return true; } // the phone holds this very text (v126 speed, part 3)
  if(mirrorSave('visits', str)){ mirrorNoteWrite('visits', true); return true; }
  mirrorNoteWrite('visits', false);
  // device storage full: keep this quarter so the offline screen still has it
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const ok = mirrorSave('visits', JSON.stringify((all || []).filter(v => v && (!v.date || v.date >= cutoff))));
  if(ok) _deviceStale.visits = true; // a partial copy: a queued list is served from memory, not from it
  return ok;
}
function visitsArchivesObj(){ const o = {}; Object.keys(_visitsArch).forEach(m => { o[m] = _visitsArch[m].arr; }); return o; }
async function loadVisits(run){
  if(_visitsSaving) return visits; // never swap the list underneath a save
  const F = readFlags(run);
  const gen0 = run && run.pf ? run.pf.gen : _localGen; // a save that runs while this reads makes what it read older than memory (v121; reads asked for earlier: since then)
  const today = todayStr();
  if(outboxHas('visits')){
    if(_deviceStale.visits){ F.mirror.visits = true; return visits; } // its device copy is older than memory (a full phone)
    const mm = UMCore.safeParse(mirrorGet('visits'), undefined);
    if(Array.isArray(mm)){ F.mirror.visits = true; mergeBaseFromPhone('visits'); return mm; } // queued offline edits win until flushed (merged against what the phone kept, v123)
  }
  let liveRes, idxRes;
  // the past months this phone keeps in its store (v126), read beside the index — at the start of a session only (a
  // month read this session is in memory)
  const keptP = (run && (run.noKept || run.local || run.readFirst)) || Object.keys(_visitsArch).length ? null : keptAll(UMCore.VISITS_ARCH_PREFIX);
  try{
    if(run && run.local) throw new Error('the early open reads no cloud'); // this phone's copy, as an offline start has it (v126 speed, part 3)
    [liveRes, idxRes] = await Promise.all([
      withTimeout(pfTake(run, 'visits') || window.storage.get('visits', true), 8000),
      withTimeout(pfTake(run, 'visitsIndex') || window.storage.get('visitsIndex', true), 8000).catch(() => null),
    ]);
  }catch(e){
    noteNoAccess('visits', e); // the rules refused this read: said, never taken for "no connection" (v123)
    if(_deviceStale.visits){ F.mirror.visits = true; return visits; } // the device copy is older than memory (a full phone)
    const raw = mirrorGet('visits'), m = UMCore.safeParse(raw, null);
    if(Array.isArray(m)){
      F.mirror.visits = true;
      if(run && run.local) run.visitsPhoneText = raw; // what the early open drew: the start's read compares what it puts together with it
      // nothing queued: what the phone kept beside a save that was on its way, else that
      // copy — what this phone last saw the cloud hold — is the base of the next save
      // where no read of this session gave one (v123, as for clinics; kept as text,
      // read only if a save needs it — the start does no extra work)
      if(!outboxHas('visits')){ mergeBaseFromPhone('visits'); if(!_visitsBaseHash && _visitsLoaded == null && _visitsBaseText == null) _visitsBaseText = raw; }
      return m;
    }
    F.failed.visits = true;
    return [];
  }
  const liveText = liveRes && typeof liveRes.value === 'string' ? liveRes.value : null, idxText = idxRes && typeof idxRes.value === 'string' ? idxRes.value : null;
  if(run) run.visitsTexts = { live: liveText, idx: idxText };
  const index = idxRes && idxRes.value != null ? (UMCore.safeParse(idxRes.value, null) || {}) : {};
  let months = Object.keys(index.months || {});
  // every month the cloud holds was read now (or is unchanged since): only then does
  // a visit missing from them say anything (a held delete is confirmed, round 3)
  let complete = !!(idxRes && idxRes.value != null);
  if((!idxRes || idxRes.value == null) && !_visitsListed){
    // no index yet (legacy account, or its write failed): look for archives once per session
    _visitsListed = true;
    try{ const l = await withTimeout(window.storage.list(UMCore.VISITS_ARCH_PREFIX, true), 8000); months = (l && l.keys || []).map(k => k.slice(UMCore.VISITS_ARCH_PREFIX.length)); complete = !!idxRes; }catch(e){}
  }
  Object.keys(_visitsArch).forEach(m => { if(!months.includes(m)) months.push(m); });
  const broken = [], got = {};
  // while a visit's delete is held and may be confirmed now (round 3), every month is read again:
  // "the cloud no longer holds that visit" must come from a read made now, never from the copy an
  // earlier read left
  const readAll = !!heldSettledNow().visits;
  // A month the store keeps (v126) may stand in for its read — for the SCREEN only, at the start of a session — while
  // the index read now gives it the same revision, the kept copy is under KEEP_RECHECK_MS old, and no delete of a visit
  // is held, on its way to the log or marked as published again (the delete log read in this same refresh, run.tombsP:
  // a held delete lets go, settles or is written down as brought back on what the cloud's lists hold, so then every
  // month comes from the cloud). The refresh that puts it on screen reads it from the cloud before it ends
  // (visitsConfirmKept), and nothing writes a visits document before that; nor does a read with a kept month in it
  // count as "every month read" (visitsComplete). Every other month is read at once, beside the delete log — only the
  // months that may stand in wait for it (v126 review).
  const idxRead = !!(idxRes && idxRes.value != null);
  // v126 speed: the live month and the index exactly as the visits on screen were put together from them (_onScreen),
  // every month at the revision on screen and read from the cloud this session, nothing saved here since, no copy of them
  // on the phone to write whole again (mirrorRetryDue: then they are put together and the copy written): nothing is
  // parsed or put together again. loadAllNow keeps the visits on screen — or puts them together now (run.visitsLater)
  // when the deletes known or the doctor merges changed. Still a read from the cloud of every month (run.visitsComplete).
  const rec = _onScreen.visits;
  const revOf0 = m => (index.months && index.months[m] && index.months[m].rev) || 0;
  if(run && rec && !mirrorRetryDue('visits') && idxRead && !readAll && !keptP && liveText === rec.live && idxText === rec.idx && _localGen === _onScreen.gen && visits === _onScreen.refs.visits
     && !_visitsBroken.length && !keptMonthsOnScreen() && months.every(m => _visitsArch[m] && _visitsArch[m].rev === revOf0(m) && _visitsArch[m].kept == null)){
    run.visitsSame = true; run.visitsComplete = true;
    run.visitsLater = () => finish(UMCore.safeParse(liveText, null) || [], {}, [], {}, {});
    return visits;
  }
  const liveArr = liveRes && liveRes.value != null ? (UMCore.safeParse(liveRes.value, null) || []) : [];
  const kept = keptP && idxRead && !readAll ? await keptBy(keptP) : {};
  const fresh = {}; // month → the text the cloud returned now (kept on the phone at the commit)
  const revOf = m => (index.months && index.months[m] && index.months[m].rev) || 0;
  const now0 = Date.now();
  const keptFor = m => {
    const e = !_visitsArch[m] && revOf(m) ? kept[UMCore.visitsArchKey(m)] : null;
    return e && e.rev === revOf(m) && Math.abs(now0 - (Number(e.at) || 0)) <= KEEP_RECHECK_MS ? e : null; // (a clock set back: as old as it is ahead)
  };
  const readMonth = async m => {
    const rev = revOf(m), have = _visitsArch[m];
    if(have && have.rev === rev && !readAll && have.kept == null) return; // unchanged since last read / written by this device
    try{
      const r = await withTimeout(window.storage.get(UMCore.visitsArchKey(m), true), 8000);
      const arr = r && r.value != null ? (UMCore.safeParse(r.value, null) || []) : [];
      got[m] = { rev, arr, json: JSON.stringify(arr) };
      if(r && typeof r.value === 'string' && rev) fresh[m] = { rev, text: r.value, canon: r.value === got[m].json };
    }catch(e){ complete = false; if(!have) broken.push(m); } // an earlier copy is kept; a month never read is flagged
  };
  // After an early open (v126 speed, part 3: run.readFirst) the screen already shows every month from this phone's copy:
  // each past month is read from the cloud at once, and only a month whose read fails takes the store's copy as its
  // stand-in (for the screen only, under the same rules: read again by the next refresh) — the store is not read first.
  const readFirst = !!(run && run.readFirst);
  const standIn = readFirst ? [] : months.filter(m => keptFor(m));
  const reads = months.filter(m => !standIn.includes(m)).map(readMonth);
  if(standIn.length){
    if(run && run.tombsP){ try{ await run.tombsP; }catch(e){} }
    const quiet = visitsTombsQuiet();
    standIn.forEach(m => {
      const e = keptFor(m), arr = quiet && e ? UMCore.safeParse(e.text, null) : null;
      if(Array.isArray(arr)) got[m] = { rev: e.rev, arr, json: e.canon ? e.text : JSON.stringify(arr), kept: Number(e.at) || 0 };
      else reads.push(readMonth(m));
    });
  }
  await Promise.all(reads);
  if(readFirst && broken.length && idxRead && !readAll){
    const k2 = (await keptGet(broken.map(m => UMCore.visitsArchKey(m)))) || {};
    if(run.tombsP){ try{ await run.tombsP; }catch(e){} }
    const quiet = visitsTombsQuiet();
    broken.slice().forEach(m => {
      const e = k2[UMCore.visitsArchKey(m)];
      if(!(quiet && e && revOf(m) && e.rev === revOf(m) && Math.abs(now0 - (Number(e.at) || 0)) <= KEEP_RECHECK_MS)) return;
      const arr = UMCore.safeParse(e.text, null);
      if(!Array.isArray(arr)) return;
      got[m] = { rev: e.rev, arr, json: e.canon ? e.text : JSON.stringify(arr), kept: Number(e.at) || 0 };
      broken.splice(broken.indexOf(m), 1);
    });
  }
  return finish(liveArr, got, broken, fresh, kept);
  // what was read, put together: the visits on screen once loadAllNow takes them (run.visitsCommit)
  function finish(liveArr, got, broken, fresh, kept){
  const keptIn = months.some(m => got[m] ? got[m].kept != null : !!(_visitsArch[m] && _visitsArch[m].kept != null));
  if(run) run.visitsComplete = complete && !keptIn;
  // A visits save ran meanwhile: what this read brought back is older than
  // the list in memory and than what that save recorded as stored — keep
  // both; the next refresh reads again.
  if(_bootLoaded && savedSince(gen0)){ console.warn('visits: a save ran while this refresh read — the list on screen is kept'); return visits; }
  const order = v => (v && v.ts) || (v && v.date ? new Date(v.date + 'T00:00:00').getTime() : 0);
  const archNext = Object.assign({}, _visitsArch, got), archObj = {};
  Object.keys(archNext).forEach(m => { archObj[m] = archNext[m].arr; });
  const all = UMCore.visitsAssemble(liveArr, archObj, today).sort((a, b) => order(a) - order(b)); // the same chronological order the single document had
  // after an early open (v126 speed, part 3): the text the visits put together now make, compared with the copy it drew
  // (loadAllNow) and written as the phone's copy only if it differs — one stringify for both
  const allText = run && _onScreen.visitsPhone ? JSON.stringify(all) : null;
  if(run) run.visitsAllText = allText;
  // the visits that only a month from the store holds: never evidence that the cloud holds them (the held deletes in
  // loadAllNow, v126 review)
  const keptMs = Object.keys(archNext).filter(m => archNext[m].kept != null);
  if(run && keptMs.length){
    const other = new Set(liveArr.filter(x => x && x.id != null).map(x => x.id)), only = new Set();
    Object.keys(archNext).forEach(m => { if(archNext[m].kept == null) archNext[m].arr.forEach(x => { if(x && x.id != null) other.add(x.id); }); });
    keptMs.forEach(m => archNext[m].arr.forEach(x => { if(x && x.id != null && !other.has(x.id)) only.add(x.id); }));
    run.visitsKeptOnly = only;
  }
  // What was read becomes the base of the next save — the documents' texts,
  // the phone's copy — only together with the visits on screen (v123 review):
  // a refresh that keeps the lists on screen because a save ran while it read
  // (loadAllNow's "raced") left its base moved under the older visits, and the
  // next save took this phone's older copy of every visit for its own change —
  // another phone's correction was undone. With a run, loadAllNow commits it
  // when it puts these visits on screen; without one, at once.
  const commit = () => {
    Object.assign(_visitsArch, got);
    _visitsBroken = broken;
    // what this read brought from the cloud is kept on the phone, as the cloud returned it, with the revision the
    // index gave it in the same read (v126); a month the index no longer lists is let go
    const now = Date.now(), idxMonths = Object.keys(index.months || {});
    keepPut(Object.keys(fresh).map(m => ({ k: UMCore.visitsArchKey(m), rev: fresh[m].rev, text: fresh[m].text, canon: fresh[m].canon, at: now })),
      idxRead ? Object.keys(kept).filter(k => !idxMonths.includes(k.slice(UMCore.VISITS_ARCH_PREFIX.length))) : []);
    if(readFirst && idxRead) keptKeys(UMCore.VISITS_ARCH_PREFIX).then(ks => { if(ks) keepPut(null, ks.filter(k => !idxMonths.includes(k.slice(UMCore.VISITS_ARCH_PREFIX.length)))); }); // (the store was not read: its months the index no longer lists, by key)
    _visitsLive = liveArr;
    _visitsLoaded = JSON.stringify(liveArr);
    if(!outboxHas('visits')){ _visitsBaseHash = null; _visitsBaseRecs = null; _visitsBaseText = null; _visitsBaseParsed = null; dropMergeBaseOnPhone('visits'); } // the documents just read are the base now
    // If the assembled log arrives FAR smaller than what this device saw last
    // time, keep the old copy aside — it may be the only surviving one.
    const prevRaw = mirrorGet('visits'), prev = UMCore.safeParse(prevRaw, null);
    if(Array.isArray(prev) && prev.length >= 10 && all.length < prev.length / 3){ try{ localStorage.setItem('um_mirror_prev:visits', prevRaw); }catch(e){} }
    visitsMirrorSave(all, allText, prevRaw);
    renderVisitsNudge();
  };
  if(run) run.visitsCommit = commit; else commit();
  return all;
  }
}
// ---- The past months on screen that came from the phone's store (v126 review) ----
// A kept month is for the screen only: it is never evidence of what the cloud
// holds until this session has read it from the cloud. The review found why
// it matters: a save of ANOTHER month took the kept copy for "the cloud holds
// this visit there" (Pass B's `stored`) and removed from the cloud a visit
// that another phone had moved between two past months; a save of the kept
// month itself put the moved visit back at its old date (mergeById keeps what
// the cloud lacks). So every kept month is read from the cloud — at the end of
// the refresh that put it on screen, and in the visits save chain before
// anything of this session writes a visits document (a save, its tidy, a
// photo mark): after this, `_visitsArch` holds only months read from the cloud
// this session or written by it, as v125 had after a start.
// Where the cloud's text is the kept one (nearly always), nothing changes on
// screen. Where it differs, the screen is put on the cloud's: a visit this
// phone did not change takes the cloud's copy (wherever a document read now
// holds it), or leaves the screen when none holds it; a visit this phone
// changed keeps the change, merged field by field over the cloud's copy (the
// kept text is the base — the screen took its visits from there); a visit of
// those months that the screen does not show joins it (unless deleted).
// A month whose read fails stays kept (the next refresh reads it again): a
// save never writes it nor takes it for what the cloud holds, and a save that
// changes it does not land — it stays on this phone, queued (persistVisitsInner).
// → { changed: whether the screen changed, unread: the months still kept }
function visitsConfirmKept(){
  if(!keptMonthsOnScreen()) return Promise.resolve({ changed: false, unread: [] });
  const run = async () => { _visitsSaving = true; try{ return await visitsConfirmKeptNow(); } finally { _visitsSaving = false; } };
  _localGen++; _localSaving++; // a refresh on its way keeps the lists (see persist)
  const p = _visitsSaveChain.then(run, run);
  _visitsSaveChain = p.catch(() => {});
  return p.finally(() => { _localSaving--; _localGen++; });
}
// In the visits save chain (the caller holds _visitsSaving).
async function visitsConfirmKeptNow(){
  const ms = Object.keys(_visitsArch).filter(m => _visitsArch[m] && _visitsArch[m].kept != null);
  if(!ms.length) return { changed: false, unread: [] };
  let index;
  try{ const idxRes = await withTimeout(window.storage.get('visitsIndex', true), 8000); index = (idxRes && idxRes.value != null ? UMCore.safeParse(idxRes.value, null) : null) || {}; }
  catch(e){ return { changed: false, unread: ms }; } // the revisions are not known: nothing is taken
  const texts = {}, ok = [];
  await Promise.all(ms.map(async m => {
    try{ const r = await withTimeout(window.storage.get(UMCore.visitsArchKey(m), true), 8000); texts[m] = r && typeof r.value === 'string' ? r.value : null; ok.push(m); }
    catch(e){} // stays kept: read again by the next refresh
  }));
  const unread = ms.filter(m => !ok.includes(m));
  const revOf = m => (index.months && index.months[m] && index.months[m].rev) || 0;
  const now = Date.now(), today = todayStr(), read = {}, stale = [];
  ok.forEach(m => {
    const arr = texts[m] != null ? UMCore.safeParse(texts[m], null) : null, a = Array.isArray(arr) ? arr : []; // as loadVisits reads it
    read[m] = { arr: a, json: JSON.stringify(a) };
    if(read[m].json !== _visitsArch[m].json) stale.push(m);
  });
  let changed = 0;
  if(stale.length){
    const base = new Map(); // id → the visit as the kept copy holds it: what the screen took
    stale.forEach(m => (UMCore.safeParse(_visitsArch[m].json, null) || []).forEach(v => { if(v && v.id != null && !base.has(v.id)) base.set(v.id, v); }));
    // the cloud's copy of each visit as this session knows it — the months just read and the documents read or written
    // this session (their texts: an object on screen may carry an edit not saved yet); never a month still kept — one
    // copy per visit, where its date says it belongs (visitsAssemble)
    const archNow = {};
    Object.keys(_visitsArch).forEach(m => { if(read[m]) archNow[m] = read[m].arr; else if(_visitsArch[m].kept == null) archNow[m] = UMCore.safeParse(_visitsArch[m].json, null) || []; });
    const cloudOf = new Map(UMCore.visitsAssemble(UMCore.safeParse(_visitsLoaded, null) || [], archNow, today).filter(v => v && v.id != null).map(v => [v.id, v]));
    const fm = typeof UMCore.mergePhotos3 === 'function' ? { photos: (L, C, B) => UMCore.mergePhotos3(L, C, B) } : null;
    const copy = o => JSON.parse(JSON.stringify(o));
    const setTo = (s, rec) => { Object.keys(s).forEach(k => { if(!(k in rec)) delete s[k]; }); Object.assign(s, copy(rec)); }; // in place: a sheet holding the visit keeps it
    const ts = tombSet('visits'), seen = new Set(), drop = new Set();
    (visits || []).forEach(s => {
      if(!s || s.id == null) return;
      seen.add(s.id);
      const b = base.get(s.id);
      if(!b) return; // not from a month that changed
      const c = cloudOf.get(s.id), sj = JSON.stringify(s);
      if(sj === JSON.stringify(b)){ // not changed here: the cloud's copy, or none
        if(!c){ drop.add(s.id); changed++; }
        else if(JSON.stringify(c) !== sj){ setTo(s, c); changed++; }
        return;
      }
      if(!c || typeof UMCore.merge3Record !== 'function') return; // changed here and no document read now holds it: this phone's change stays (never lost)
      const r = UMCore.merge3Record(s, c, b, fm);
      if(r && r.value && JSON.stringify(r.value) !== sj){ setTo(s, r.value); changed++; }
    });
    const add = [];
    stale.forEach(m => read[m].arr.forEach(v => {
      if(!v || v.id == null || seen.has(v.id) || ts.has(v.id)) return;
      const c = cloudOf.get(v.id) || v; seen.add(v.id); add.push(copy(c)); changed++;
    }));
    if(drop.size) visits = (visits || []).filter(v => !(v && drop.has(v.id)));
    if(add.length) visits = (visits || []).concat(add);
  }
  // every month read is now a month read from the cloud this session, at the revision the index gave in this read
  ok.forEach(m => { const st = stale.includes(m); _visitsArch[m] = { rev: revOf(m), arr: st ? read[m].arr : _visitsArch[m].arr, json: st ? read[m].json : _visitsArch[m].json }; });
  keepPut(ok.filter(m => texts[m] != null && revOf(m)).map(m => ({ k: UMCore.visitsArchKey(m), rev: revOf(m), text: texts[m], canon: texts[m] === read[m].json, at: now })));
  if(changed){ applyDoctorRemap(); visitsMirrorSave(visits); }
  return { changed: changed > 0, unread };
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
  const run = { failed: {}, mirror: {}, noKept: true }, gen0 = _localGen; // (a retry reads the cloud: nothing stands in from the store)
  const all = await loadVisits(run);
  // what was read goes on screen (and becomes the base) only when no save ran meanwhile (v123 review)
  if(!_visitsSaving && !savedSince(gen0)){
    if(run.visitsCommit) run.visitsCommit();
    if(run.failed.visits) _loadFailed.visits = true; else delete _loadFailed.visits;
    if(run.mirror.visits) _mirrorUsed.visits = true; else delete _mirrorUsed.visits;
    visits = all.filter(v => !(v && tombSet('visits').has(v.id))); renderAll();
  }
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
    // a past month on screen that came from the phone's store is read from the cloud first: nothing below may take it
    // for what the cloud holds (v126 review). One whose read fails stays kept: never written nor trusted here (below)
    if(keptMonthsOnScreen()) await visitsConfirmKeptNow();
    const today = todayStr();
    if(!opts.authoritative) await refreshTombs();
    const ts = tombSet('visits');
    const local = (visits || []).filter(v => v && !ts.has(v.id));
    const part = UMCore.visitsPartition(local, today);
    // a month still kept (its read failed just now): when this phone's list differs from it there — an edit, a visit
    // moved in or out —, the save does not land and nothing is written; it stays on this phone, queued (v126 review)
    const unreadKept = m => !!(_visitsArch[m] && _visitsArch[m].kept != null);
    const touched = Object.keys(_visitsArch).filter(m => unreadKept(m) && JSON.stringify(part.months[m] || []) !== _visitsArch[m].json);
    if(touched.length) throw new Error('visits: ' + touched.join(', ') + ' not read from the cloud yet — kept on this phone');
    const homeById = {};
    part.live.forEach(v => { if(v.id != null) homeById[v.id] = 'live'; });
    Object.keys(part.months).forEach(m => part.months[m].forEach(v => { if(v.id != null) homeById[v.id] = m; }));
    const stored = new Set(); // "doc|id" pairs the cloud is known to hold
    const note = (doc, arr) => (arr || []).forEach(v => { if(v && v.id != null) stored.add(doc + '|' + v.id); });
    note('live', _visitsLive); Object.keys(_visitsArch).forEach(m => { if(!unreadKept(m)) note(m, _visitsArch[m].arr); }); // (a kept month is no evidence)
    const keyOf = doc => doc === 'live' ? 'visits' : UMCore.visitsArchKey(doc);
    const written = {};
    // The cloud refuses a document above 1 MB. A month can only get there
    // with a great many photos; say so plainly instead of retrying a save
    // that can never land (v123: measured in bytes, never queued — persistNow).
    const monthOf = doc => doc === 'live' ? today.slice(0, 7) : doc;
    // What each transaction committed, as the exact string it wrote (v122).
    // `written` holds the merged objects, which ARE the visits on screen: an
    // edit made while the commit was on its way changed them too, and
    // recording their JSON afterwards counted that edit as stored — the save
    // it started then found nothing to write and still said "saved".
    const writtenStr = {};
    const committedStr = (res, arr) => typeof res === 'string' ? res : JSON.stringify(arr);
    // The base of each document's three-way merge (v123): the document as the
    // cloud last confirmed it to this phone — the text read or written this
    // session — else the fingerprints kept on the phone or taken from its copy
    // at a start without a read. A visit this phone did not change takes the
    // cloud's version (a correction made on another phone stays); with no base
    // at all this phone's copy wins, as before (v121 and earlier: always).
    // When the cloud still holds exactly that text, no other phone wrote the
    // document since: there is nothing to take from it, and no merge runs (the
    // usual save costs one comparison; the base is parsed only when needed).
    const baseOf = (doc, cloudStr) => {
      const str = doc === 'live' ? _visitsLoaded : (_visitsArch[doc] && _visitsArch[doc].json);
      if(typeof str !== 'string') return visitsFallbackBase();
      if(cloudStr === str) return null;
      const arr = UMCore.safeParse(str, null);
      return Array.isArray(arr) ? new Map(arr.filter(v => v && v.id != null).map(v => [v.id, v])) : visitsFallbackBase();
    };
    const patches = []; // what the merges took from the cloud, put on screen once everything has landed
    const writeUnion = async (doc, arr) => {
      let merged = arr, tooBig = 0, took = [], changed = false;
      const res = await storageUpdate(keyOf(doc), cloudStr => {
        tooBig = 0; changed = false; // a transaction may run more than once
        if(opts.cancelled && opts.cancelled()) return null; // a whole-day restore that stopped: a run of its write after that writes nothing (round 4)
        // a whole-day restore writes only over exactly the document it checked (round 3)
        if(opts.expect && Object.prototype.hasOwnProperty.call(opts.expect, doc) && (cloudStr == null ? null : String(cloudStr)) !== opts.expect[doc]){ changed = true; return null; }
        const cloud = cloudStr != null ? UMCore.safeParse(cloudStr, null) : null;
        took = [];
        merged = (!opts.authoritative && Array.isArray(cloud)) ? mergeById('visits', arr, cloud, baseOf(doc, cloudStr), took).merged : arr.filter(v => v && !ts.has(v.id));
        const str = JSON.stringify(merged);
        if(!UMCore.fitsBytes(str, DOC_MAX_BYTES)){ tooBig = UMCore.utf8Len(str); return null; }
        return str;
      }, 12000, typeof opts.onRaw === 'function' ? p => opts.onRaw(keyOf(doc), p) : undefined);
      if(tooBig) throw tooLargeError('visits', monthOf(doc), tooBig); // said by persistNow (bar + toast), never queued
      if(changed){ const e = new Error('changed meanwhile: ' + keyOf(doc)); e.casChanged = keyOf(doc); throw e; }
      if(res == null) throw new Error('visits update failed');
      clearTooLarge('visits:' + monthOf(doc)); // that month's document took this write: it is no longer too large
      written[doc] = merged;
      writtenStr[doc] = committedStr(res, merged);
      note(doc, merged);
      took.forEach(t => patches.push(t));
      return merged;
    };
    // Pass A — union writes of every document this device changed (never loses).
    const dirty = [];
    if(opts.authoritative || JSON.stringify(part.live) !== _visitsLoaded) dirty.push(['live', part.live]);
    Object.keys(part.months).forEach(m => {
      if(_visitsBroken.includes(m) || unreadKept(m)) return; // a month we could not read is never written
      const have = _visitsArch[m];
      if(!have || JSON.stringify(part.months[m]) !== have.json) dirty.push([m, part.months[m]]);
    });
    _visitsDirtyDocs = new Set(dirty.map(([doc]) => doc)); // a save that does not land keeps the bases of what changed in these (visitsChangedBases)
    const overflow = {}; // cloud-only entries found in a document that is not their home
    for(const [doc, arr] of dirty){
      const merged = await writeUnion(doc, arr);
      merged.forEach(v => { if(v && v.id != null && !homeById[v.id]){ const h = UMCore.visitHome(v, today); homeById[v.id] = h; if(h !== doc) (overflow[h] = overflow[h] || []).push(v); } });
    }
    // Pass A2 — re-home what another (older) device left in the wrong document.
    for(const h of Object.keys(overflow)){
      if(h !== 'live' && (_visitsBroken.includes(h) || unreadKept(h))) continue;
      const base = written[h] || (h === 'live' ? part.live : (part.months[h] || []));
      const ids = new Set(base.map(v => v && v.id));
      await writeUnion(h, base.concat(overflow[h].filter(v => !ids.has(v.id))));
    }
    // Pass B — tidy: shed a visit from a document once its home provably holds it.
    const docs = new Set(['live', ...Object.keys(_visitsArch), ...Object.keys(written)]);
    for(const doc of docs){
      if(doc !== 'live' && (_visitsBroken.includes(doc) || unreadKept(doc))) continue;
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
        Object.keys(_visitsArch).forEach(m => { if(!idx.months[m] && !unreadKept(m)) idx.months[m] = { n: _visitsArch[m].arr.length, rev: _visitsArch[m].rev || now }; });
        idx.v = 1; idx.updated = now;
        return JSON.stringify(idx);
      }, 12000);
      if(res == null) throw new Error('visits index failed');
      writtenMonths.forEach(m => { _visitsArch[m] = { rev: now, arr: written[m], json: writtenStr[m] }; });
      writtenMonths.concat(owed).forEach(m => { delete _visitsIdxOwed[m]; });
    }
    if(written.live){ _visitsLive = written.live; _visitsLoaded = writtenStr.live; }
    // What the merges took from the cloud (another phone's correction of a
    // visit this phone did not change) goes on the visits on screen, in place:
    // left on the older copy, the next save counted it as this phone's change
    // and put it back. A field edited here while the save was on its way keeps
    // that edit (its own save follows).
    patches.forEach(p => p.fields.forEach(([k, before, val]) => {
      if(JSON.stringify(p.obj[k] === undefined ? null : p.obj[k]) !== before) return;
      if(val === undefined) delete p.obj[k]; else p.obj[k] = val;
    }));
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
    _visitsDirtyDocs = null;
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
  const ks = Object.keys(_visitsArch), has = k => (_visitsArch[k].arr || []).some(v => v && v.id === id);
  const m = ks.find(k => _visitsArch[k].kept == null && has(k)) || ks.find(has); // a month read from the cloud first (v126 review)
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
      Object.keys(_visitsArch).forEach(m => { if(!idx.months[m] && _visitsArch[m].kept == null) idx.months[m] = { n: _visitsArch[m].arr.length, rev: _visitsArch[m].rev || now }; }); // (a month from the store says nothing of the cloud, v126 review)
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
    // the document holding a visit is known only from documents read from the cloud (v126 review): a kept month is read
    // first; a visit that only a month still kept places is asked again next round
    if(keptMonthsOnScreen()) await visitsConfirmKeptNow();
    const byDoc = {};
    changes.forEach(c => { const d = visitDocOf(c.visitId); if(_visitsArch[d] && _visitsArch[d].kept != null) out[c.photoId] = 'failed'; else (byDoc[d] = byDoc[d] || []).push(c); });
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
let _erpKeptSwept = false; // the store's sales chunks the index no longer names are let go once a session
async function loadErpSales(run){
  const F = readFlags(run);
  const es = await cloudGet('erpSales', null, run);
  // v126 speed: the index exactly as the files on screen were put together from it (_onScreen), every file's rows in
  // hand, nothing saved here since, no copy of them on the phone to write whole again (mirrorRetryDue): the files on screen ARE that index's (a file's rows never change under their key,
  // v119) — nothing is parsed, put together or written to the phone's copy again (loadAllNow keeps them: run.erpSame)
  const esText = es && typeof es.value === 'string' ? es.value : null;
  const fromPhone = !!(run && run.local); // the early open (v126 speed, part 3)
  // the index text the copy was put together from (kept beside it at its last read or save): the start's read compares with it
  if(run) run.erpText = fromPhone ? (() => { try{ return localStorage.getItem(COPY_IDX_ERP); }catch(e){ return null; } })() : esText;
  if(run && _onScreen.erpSales && !mirrorRetryDue('erpSales') && !F.mirror.erpSales && !F.failed.erpSales && esText === _onScreen.erpSales.text && erpSales === _onScreen.refs.erpSales
     && _localGen === _onScreen.gen && !_erpDirty && !_erpSaving && !_erpBroken.length && !_erpPutBack && erpPeriods().every(p => p && !p.rowsMissing)){
    run.erpSame = true;
    return erpSales;
  }
  const prevMirror = UMCore.safeParse(mirrorGet('erpSales'), null); // assembled copy from last time
  const index = Object.assign({periods: []}, UMCore.safeParse(es && es.value, null) || {});
  if(!Array.isArray(index.periods)) index.periods = [];
  const keys = UMCore.erpChunkKeys(index);
  _erpStored = new Set(keys);
  _erpBroken = [];
  // A file's rows never change under their key (a new upload is a new key):
  // the files this phone already holds exactly are not downloaded again —
  // erpFillFromMirror below puts them in from the phone's copy (v119); nor are
  // the files on screen under the same key and line count (v126 review: a
  // 20-second round reads nothing for them, not even the store), nor the
  // files the store keeps whole (v126) — the store is read for the others only.
  const held = {};
  ((prevMirror && prevMirror.periods) || []).forEach(p => { if(p && Array.isArray(p.rows) && p.rows.length) held[UMCore.erpRowsKey(p)] = p.rows.length; });
  const heldExact = ref => held[ref.key] != null && (ref.count == null || held[ref.key] === ref.count);
  const shown = {};
  ((erpSales && erpSales.periods) || []).forEach(p => { if(p && !p.rowsMissing && Array.isArray(p.rows) && p.rows.length) shown[UMCore.erpRowsKey(p)] = p.rows; });
  const shownExact = ref => !!shown[ref.key] && (ref.count == null || shown[ref.key].length === ref.count);
  const have = ref => heldExact(ref) || shownExact(ref);
  const reading = !F.mirror.erpSales && !F.failed.erpSales;
  // the early open: the files of the copy that lack their rows (a full phone keeps a slimmer copy) come from the store — exact under their key
  const needKeys = reading || fromPhone ? UMCore.erpChunkKeys({ periods: index.periods.filter(h => h && h.rowsRef && !have(h.rowsRef) && !(fromPhone && Array.isArray(h.rows) && !h.rowsMissing)) }) : [];
  const kept = needKeys.length ? (fromPhone ? ((await keptGet(needKeys)) || {}) : await keptBy(keptGet(needKeys))) : {}, fromStore = erpKeptDocs(index, kept, have), storeFiles = new Set(fromStore.files);
  const fetchKeys = UMCore.erpChunkKeys({ periods: index.periods.filter(h => !(h && h.rowsRef && (have(h.rowsRef) || storeFiles.has(h.rowsRef.key)))) });
  let docs = Object.assign({}, fromStore.docs);
  const texts = {};
  if(fetchKeys.length && reading) Object.assign(docs, await erpFetchChunks(fetchKeys, null, texts));
  if(reading){
    // each chunk the cloud returned is kept as it came; once a session, the keys the index no longer names are let go
    const now = Date.now();
    keepPut(Object.keys(texts).map(k => ({ k, text: texts[k], at: now })));
    if(!_erpKeptSwept){ _erpKeptSwept = true; const names = new Set(keys); keptKeys('erpRows:').then(ks => { if(ks) keepPut(null, ks.filter(k => !names.has(k))); }); }
  }
  _erpPutBack = 0;
  const out = UMCore.erpAssemble(index, docs);
  if(out.missing.length){ // the files on screen under the same key and line count: their rows as they are
    out.sales.periods.forEach(p => { if(p && p.rowsMissing && p.rowsRef && shownExact(p.rowsRef)){ p.rows = shown[p.rowsRef.key]; delete p.rowsMissing; } });
    out.missing = out.sales.periods.filter(p => p && p.rowsMissing).map(p => p.id);
  }
  if(out.missing.length && !fromPhone) out.missing = erpFillFromMirror(out.sales, prevMirror);
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
  if(fromPhone){ if(out.missing.length) run.erpIncomplete = out.missing.slice(); return out.sales; } // the early open: a file without its rows here → no early open (loadAllNow); nothing written, nothing retried
  if(out.missing.length){
    // Rows the cloud would not hand over right now: the period stays listed
    // with rowsMissing (its stored chunks are left untouched by any save), the
    // supervisor sees a warning with a retry button — never a silent blank —
    // and a quieter second attempt with a long budget runs by itself.
    _erpBroken = out.missing.slice();
    console.error('erpSales: rows unreadable for periods', out.missing);
    if(prevMirror){ mirrorNoteWrite('erpSales', false); erpMirrorIdx(null); mirrorSave('erpSales', JSON.stringify(prevMirror)); } // keep the last good assembled copy (not the index read now's)
    setTimeout(() => { retryErpRows({ quiet: true, timeoutMs: 60000 }).catch(() => {}); }, 1500);
  } else if(!F.mirror.erpSales && !F.failed.erpSales){
    erpMirrorSave(assembled, esText); // cloudGet mirrored the bare index — replace it with the assembled copy
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
let _erpSaveGen = 0; // moves with every sales save: a read asked for before it is older than memory (prefetchStart)
async function persistErpSalesNow(){
  _erpSaving = true; _erpSaveGen++;
  try{ return await persistErpSalesInner(); }
  finally{ _erpSaving = false; _erpSaveGen++; }
}
// What the last sales save that did not land was (persistNow's outcome): the
// rules refused it, its answer did not come back in time, or a guard stopped it.
let _erpSaveFail = null;
async function persistErpSalesInner(){
  _erpSaveFail = null;
  if(_loadFailed.erpSales){
    // The index itself never loaded (cloud unreachable, no mirror): what is on
    // screen is empty, and writing it would erase every uploaded file.
    _erpSaveFail = { refused: true, quiet: true };
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
    erpMirrorSave(erpSales, entries[entries.length - 1][1]); // the index text the cloud now holds: kept beside the copy (v126 speed, part 3)
    if(outboxHas('erpSales')) outboxRemove('erpSales');
    delete _mirrorUsed.erpSales;
    _erpDirty = false; renderErpDirtyPill();
    // 6) Orphans past their grace period — best effort, after the index is safe.
    due.forEach(k => { window.storage.delete(k, true).then(() => _erpStored.delete(k)).catch(() => {}); });
    return true;
  }catch(e){
    console.error('erpSales save failed', e);
    _erpDirty = true; renderErpDirtyPill();
    const kind = saveErrKind(e);
    _erpSaveFail = kind === 'refused' ? { refused: true, denied: true } : kind === 'tooLarge' ? { tooLarge: true } : /timeout/.test(String(e && e.message)) ? { timeout: true } : null;
    if(kind === 'refused') showToast(NOT_ALLOWED_MSG, 6000); // the rules said no: a retry cannot land until they change
    else offlineToast('📴 لم يُحفظ ملف المبيعات — تحقق من الاتصال وأعد المحاولة');
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
    el.className = 'sbar sbar-pill sbar-danger sbar-tap';   // the look is in index.html (status bars)
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
// A read the security rules refused (v123): this login may not read the
// team's data (a login outside the rules' lists, rules not matching the
// app). What this phone holds is still shown, as with no connection — but
// it is said for what it is, once per session.
const _noAccess = {};
let _noAccessSaid = false;
function noteNoAccess(key, e){
  if(saveErrKind(e) !== 'refused') return false;
  _noAccess[key] = true;
  console.warn('read refused by the security rules: ' + key); // said on screen (noteNoAccess): a handled refusal, not a page error
  if(!_noAccessSaid){ _noAccessSaid = true; showToast('🔒 No access to the team\'s data on this login — ask the supervisor', 8000); }
  return true;
}
async function cloudGet(key, src, run){
  const F = readFlags(run); // the flags of the refresh that asked (v123), else those of the copy on screen
  if(outboxHas(key)){
    if(_deviceStale[key]){ const mem = memoryCopy(key); if(mem != null){ F.mirror[key] = true; return { value: mem }; } } // its device copy is older than memory (a full phone)
    const mm = mirrorGet(key);
    if(mm != null && UMCore.safeParse(mm, undefined) !== undefined){
      F.mirror[key] = true; // offline edits win until flushed — but never authoritative
      return { value: mm };
    }
  }
  // The early open (v126 speed, part 3): this phone's copy only — nothing is asked of the cloud, as an offline start
  // that did not try. A document the copy's last read found missing in the cloud is that again (run.none); one the copy
  // does not know is a read that failed.
  if(run && run.local){
    if(src) src.cloud = false;
    const m = mirrorGet(key);
    if(m != null){ F.mirror[key] = true; return { value: m }; }
    if(run.none && run.none.has(key)){ F.mirror[key] = true; return null; }
    F.failed[key] = true;
    return null;
  }
  try{
    // The sales index is tiny after the split but a legacy (un-split) account
    // still carries ~250 KB inline — give that one read more room, so the
    // migration can happen from a slow phone too.
    const r = await withTimeout(pfTake(run, key) || window.storage.get(key, true), key === 'erpSales' ? 20000 : 8000);
    if(src) src.cloud = true;
    if(r && r.value != null && key === 'erpSales') return r; // loadErpSales mirrors the ASSEMBLED copy, never the bare index
    // the phone's copy already holds this very text (v126 speed: most reads of a round): nothing to compare or write
    if(r && r.value != null && mirrorGet(key) !== r.value){
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
    } else if(r && r.value != null) delete _deviceStale[key]; // (as the write of that same text would)
    return r;
  }catch(e){
    if(src) src.cloud = false;
    noteNoAccess(key, e); // the rules refused this read: said, never taken for "no connection" (v123)
    if(_deviceStale[key]){ const mem = memoryCopy(key); if(mem != null){ F.mirror[key] = true; return { value: mem }; } } // the device copy is older than memory (a full phone)
    const m = mirrorGet(key);
    if(m != null){ F.mirror[key] = true; return { value: m }; }
    F.failed[key] = true;
    return null;
  }
}
// One refresh at a time (v123): a second caller — the 20-second tick, the app
// coming back on screen, a sign-in — gets the refresh already on its way. Two
// at once used to overlap: each reset the read flags the other relied on, so a
// read that had failed looked like an empty account (the factory catalog was
// written over the live one) — and an older read could finish last.
// ---- The early open (v126 speed, part 3) ----
// A phone that has its copy draws the screen of the person it last signed in from that copy right after the app
// boots — before the sign-in is confirmed (the SDK's own network round trips) and before any cloud read; the start's
// cloud read then replaces it: nothing changed → nothing is drawn again, something changed → the whole frame is
// swapped once (part 2's rules: _onScreen, the home frame). The window between that drawing and the cloud read is
// an offline start in every respect: every list drawn counts as served from the phone's copy (_mirrorUsed) until a
// read from the cloud replaces it — so the daily backup, the whole-day Restore, the held deletes, salesCheckComplete
// and visitsComplete, the nameless-clinic and lost-doctor flows, the recovery sheets and the factory defaults never
// take it for a cloud read; a save made in it is an offline start's save: a list merges three ways against that copy,
// a whole document is ONE compare-and-set against the exact text that copy came from (persistNow: changed on another
// device since → refused and said, nothing written — never merged, part 4); nothing of it is read from the cloud or
// written, and nothing reaches the cloud before the sign-in is
// confirmed (the 20-second round, the queue's upload and the 'online' upload wait for it). A small line (#copyLine)
// says the screen is this phone's copy, when it was saved and that it is updating — or that the read failed — until
// a read from the cloud is in. Only for the person this phone last signed in (um_lastUser, 03-gate.js) while
// Firebase's own saved session on the phone is theirs, and only from a whole copy (um_copyAt: written after a
// refresh that read every list from the cloud and holds every copy on the phone; it lists the documents the cloud
// did not have). A phone with no copy (the first open) starts as before.
const COPY_AT = 'um_copyAt';
let _early = null;      // { name, role, email, at, none: Set, state: 'loading' | 'drawn' | 'gone', confirmed, done }
let _earlyRun = null;   // the early open on its way (loadAll waits for it)
let _cloudRead = false; // this session's first refresh from the cloud has ended (the team lists' start rule)
let _copyLine = null;   // the line: null | 'updating' | 'failed'
function copyInfo(){
  try{ const o = JSON.parse(localStorage.getItem(COPY_AT) || 'null'); return o && typeof o.at === 'number' && Array.isArray(o.none) ? o : null; }catch(e){ return null; }
}
function copyStale(){ try{ localStorage.removeItem(COPY_AT); }catch(e){} } // a copy could not be written: no early open until a whole one is
// The deletes the screen was filtered with at the copy's read (the team's delete log as absorbed then, and this phone's
// own): kept beside the copy (um_copyTombs) so an early open filters its lists exactly as that screen was. For the
// screen only — never this phone's delete, never written to the log, never held or settled (every save reads the log
// first, as always); let go by the start's read.
const COPY_TOMBS = 'um_copyTombs', COPY_TOMB_KEYS = ['clinics', 'visits', 'tasks', 'events', 'dayPlans', 'doctors'];
let _copyTombs = null;
function copyTombsSave(){
  const o = {}; COPY_TOMB_KEYS.forEach(k => { const t = _tombstones[k]; if(t && t.size) o[k] = [...t].map(String).sort(); });
  const str = JSON.stringify(o);
  try{ if(localStorage.getItem(COPY_TOMBS) !== str) localStorage.setItem(COPY_TOMBS, str); return true; }catch(e){ return false; }
}
function copyTombsLoad(){
  let o = null; try{ o = JSON.parse(localStorage.getItem(COPY_TOMBS) || 'null'); }catch(e){}
  if(!o || typeof o !== 'object') return null;
  const m = {}; COPY_TOMB_KEYS.forEach(k => { if(Array.isArray(o[k])) m[k] = new Set(o[k].map(String)); });
  return m;
}
// the deletes a list on screen is filtered with: this phone's known deletes, and while the early open's copy is on screen
// the ones that copy was filtered with too
function tombsView(k){ const t = _tombstones[k] || new Set(), c = _copyTombs && _copyTombs[k]; if(!c || !c.size) return t; const u = new Set(t); c.forEach(id => u.add(id)); return u; }
// The documents a start reads one by one (cloudGet); the visits and the sales files have their own copies.
const COPY_KEYS = ['clinics', 'products', 'tasks', 'dayPlans', 'staff', 'recycleBin', 'benchmarks', 'events', 'targets', 'categoryGuides', 'erpMap', 'erpNotes', 'rxTypes'];
// A refresh that read every list from the cloud, with every copy on the phone whole: the copy is the cloud's as of now
function copyMark(run, docs){
  if(run.local || Object.keys(run.failed).length || Object.keys(run.mirror).some(k => !outboxHas(k))) return;
  if(Object.keys(_deviceStale).length || _visitsBroken.length || _erpBroken.length || _erpPutBack || keptMonthsOnScreen() || _seedClinics || _bootCrashed) return;
  const none = docs.filter(([k, r]) => !outboxHas(k) && !(r && r.value != null)).map(([k]) => k).sort();
  if(!copyTombsSave()){ copyStale(); return; }
  const prev = copyInfo();
  if(prev && Math.abs(Date.now() - prev.at) < 60000 && prev.none.join('|') === none.join('|')) return; // (once a minute is enough for the line's time)
  try{ localStorage.setItem(COPY_AT, JSON.stringify({ at: Date.now(), none })); }catch(e){}
}
function earlyFor(name, role){ return !!_early && _early.state !== 'gone' && _early.name === name && _early.role === role; }
// nothing reaches the cloud from the early open until the sign-in is confirmed (the round, the queue's upload)
function earlyUnconfirmed(){ return !!_early && _early.state !== 'gone' && !_early.confirmed; }
function earlyOpen(){
  try{
    if(_early || currentUser || !FIREBASE_ENABLED || !window.firebase) return;
    const R = typeof rememberedUser === 'function' ? rememberedUser() : null, info = R ? copyInfo() : null;
    if(!R || !info) return;
    const u = USERS[R.name];
    if(!u || u.role !== R.role || String(u.email || '').toLowerCase() !== R.email) return; // the team list on the phone no longer says so
    const none = new Set(info.none.filter(k => typeof k === 'string'));
    if(mirrorGet('clinics') == null || mirrorGet('visits') == null || mirrorGet('erpSales') == null) return;
    if(COPY_KEYS.some(k => mirrorGet(k) == null && !none.has(k))) return; // a list the copy does not hold
    const tombsOfCopy = copyTombsLoad();
    if(!tombsOfCopy) return; // (written with every copy mark: without it the copy is not whole)
    const e = _early = { name: R.name, role: R.role, email: R.email, at: info.at, none, state: 'loading', confirmed: false, done: false };
    _copyTombs = tombsOfCopy;
    _earlyRun = (async () => {
      // every app script has run first (the files after this one: the KPI settings the figures read, 16-kpi.js) — the
      // built site is one script, so this is the moment it ends; a sign-in confirmed meanwhile waits for the drawing
      if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
      const fb = await firebaseSavedEmail(); // Firebase's own saved session on the phone: never another person's copy
      if(_early !== e || e.state === 'gone') return;
      if(fb !== R.email){ earlyDrop(); return; }
      const r = await loadAllNow({ local: e });
      if(r !== 'drawn' && _early === e) earlyDrop();
    })().catch(err => { console.error('early open', err); if(_early === e) earlyDrop(); });
  }catch(err){ console.error('early open', err); _early = null; }
}
// The early open is let go (another person signs in, the sign-in ended, the copy was not whole): true when there was one
function earlyDrop(){
  if(!_early || _early.state === 'gone') return false;
  _prefetch = null; // (asked for this person's start: never handed to another's)
  _copyTombs = null;
  const drew = _early.state === 'drawn';
  _early.state = 'gone';
  copyLineSet(null);
  if(!drew && currentUser && currentUser === _early.user) currentUser = null; // set for its data only: the start goes on as before
  return true;
}
// The start's reads, asked for the moment the sign-in is confirmed while the early open may still be drawing: the
// cloud's answers wait here for the start's read (loadAllNow takes each once, cloudGet / loadVisits / refreshTombs) —
// nothing is parsed or put on screen before that read runs, after the drawing. The counters of what this phone saved
// are taken when they are asked for: a save made after that is newer than what they bring back (the read "raced").
let _prefetch = null;
const PREFETCH_KEYS = ['tombs', 'clinics', 'products', 'visits', 'visitsIndex', 'tasks', 'dayPlans', 'staff', 'recycleBin', 'benchmarks', 'events', 'targets', 'categoryGuides', 'erpSales', 'erpMap', 'erpNotes', 'rxTypes'];
function prefetchStart(){
  if(_prefetch || _cloudRead) return;
  const reads = Object.create(null);
  PREFETCH_KEYS.forEach(k => {
    if(outboxHas(k) || (k === 'visitsIndex' && outboxHas('visits'))) return; // served from the phone's copy (cloudGet, loadVisits)
    const p = Promise.resolve().then(() => window.storage.get(k, true));
    p.catch(() => {});
    reads[k] = p;
  });
  _prefetch = { gen: _localGen, mapGen: _erpMapGen, rxGen: _rxTypesGen, erpGen: _erpSaveGen, take(k){ const p = reads[k]; delete reads[k]; return p || null; } };
}
const pfTake = (run, k) => (run && run.pf && run.pf.take(k)) || null;
// The early open's figures worked out and painted (two frames), or 1.5 s at most (a hidden page paints no frame)
function earlyPainted(){
  const frames = () => new Promise(r => { if(typeof requestAnimationFrame !== 'function' || document.visibilityState !== 'visible') return r(); requestAnimationFrame(() => requestAnimationFrame(r)); });
  return Promise.race([Promise.resolve(typeof msWhenReady === 'function' ? msWhenReady() : null).then(frames, frames), new Promise(r => setTimeout(r, 1500))]);
}
// The sign-in of the person the early open drew for is confirmed: the start's cloud read now (it waits for the drawing)
async function earlyConfirmed(name, role){
  const e = _early;
  if(e) e.confirmed = true;
  if(e && e.state !== 'gone') prefetchStart();
  if(_earlyRun){ try{ await _earlyRun; }catch(err){} }
  if(!earlyFor(name, role) || _early.state !== 'drawn'){ // the early open did not draw (its copy was not whole): the start as before
    if(_early === e) earlyDrop();
    if(!currentUser || currentUser.name !== name) await selectUser(name, role);
    return;
  }
  if(typeof unparkSaves === 'function') unparkSaves(); // a sign-in (selectUser does it): what waited on the phone for access goes again
  await loadAll();
}
// ---- The line: this phone's copy, when it was saved, updating / not updated (v126 speed, part 3) ----
function copyTimeText(at){
  const d = new Date(at), today = new Date().toDateString() === d.toDateString();
  try{
    const t = d.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
    return today ? t : d.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' }) + ' ' + t;
  }catch(e){ return d.toISOString().slice(0, 16).replace('T', ' '); }
}
function copyLineSet(state){ if(_copyLine === state) return; _copyLine = state; renderCopyLine(); }
function renderCopyLine(){
  let el = document.getElementById('copyLine');
  if(!_copyLine || !currentUser || !_early){ if(el) el.remove(); document.body.classList.remove('um-copyline'); return; }
  if(!el){ el = document.createElement('div'); el.id = 'copyLine'; el.className = 'sbar sbar-pill sbar-copy'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.classList.toggle('failed', _copyLine === 'failed');
  el.innerHTML = `<span>This phone's copy, saved</span> <span data-notr dir="auto">${esc(copyTimeText(_early.at))}</span> <span>${_copyLine === 'failed' ? '— could not update from the cloud; it is tried again' : '— updating from the cloud…'}</span>`;
  document.body.classList.add('um-copyline');
}
// ---- Whose screen is drawn (v126 speed, part 3) ----
// A screen drawn for one person is never shown to the next: a sign-in of someone else (after a sign-out, or after the
// early open of the person this phone last signed in, whose sign-in had ended) covers it until their own is drawn.
let _screenFor = null; // 'name|role' the screen was last drawn for (renderAll)
function screenCoverFor(name, role){
  if(!_screenFor || _screenFor === name + '|' + role) return;
  document.body.classList.add('um-cover');
  try{ closeModal(); }catch(e){}
  if(!document.getElementById('coverNote')){ const n = document.createElement('div'); n.id = 'coverNote'; n.className = 'sbar sbar-pill sbar-copy'; n.setAttribute('role', 'status'); n.innerHTML = '<span>Loading...</span>'; document.body.appendChild(n); }
}
function screenDrawn(){
  if(!currentUser) return;
  _screenFor = currentUser.name + '|' + currentUser.role;
  if(document.body.classList.contains('um-cover')){ document.body.classList.remove('um-cover'); const n = document.getElementById('coverNote'); if(n) n.remove(); }
}
let _loadAllRun = null;
function loadAll(){
  if(_loadAllRun) return _loadAllRun;
  // the early open first: the start's cloud read waits for its drawing (one at a time — the two never overlap)
  const early = _earlyRun;
  const p = early ? early.then(() => loadAllNow(), () => loadAllNow()) : loadAllNow();
  _loadAllRun = p;
  const done = () => { if(_loadAllRun === p) _loadAllRun = null; };
  p.then(done, done);
  return p;
}
function refreshRunning(){ return !!_loadAllRun; }
// The whole documents: saved by compare-and-set against the exact string the
// copy on screen came from (persistNow), kept here per key: the cloud's text
// as read or as this phone last wrote it, null = no such document, undefined =
// not known (the read failed and the phone holds no copy).
const WHOLE_DOCS = ['products', 'targets', 'staff', 'recycleBin', 'benchmarks', 'categoryGuides', 'erpNotes'];
const _docLoaded = {};
// ---- What is on screen: the cloud's text each copy came from (v126 speed) ----
// Every 20-second round reads the documents again (no read is cheaper than the
// document: the start-up speed review). A document that comes back as exactly
// the text the copy on screen was taken from — read from the cloud, nothing
// saved on this phone since that copy was taken (_localGen; an account link and
// the prescription types have their own counters), the same deletes known for
// it, and the copy on screen still the very object that read put there — is not
// parsed, merged, put together or drawn again: the screen already shows that
// text. Such a read still counts as a read from the cloud for every rule that
// asks for one: its read flags (the daily backup, the whole-day Restore, the
// whole document's compare-and-set), and the held deletes it confirms or lets go
// (from the ids that text holds, kept beside it). Nothing changed at all → the
// screen is not drawn again (renderAll): scroll, an open sheet, typed text and
// focus stay as they are; only the clock's words move (msClock).
//   texts[k]  the text read (null: the cloud has no such document)
//   ids[k]    the ids (day plans: date|rep) that text holds — the held deletes it answers for
//   refs[k]   the copy on screen taken from it; tfp[k] the deletes known when it was taken (tombsFp)
//   visits    { live, idx, ids, complete, remap }: the live month and the index the visits on screen were
//             put together from (every month at the revision on screen, none from the phone's store)
//   erpSales  { text }: the sales index the files on screen were put together from (every file's rows in hand)
const _onScreen = { gen: null, who: null, drawn: null, texts: Object.create(null), ids: Object.create(null), refs: Object.create(null), tfp: Object.create(null), visits: null, erpSales: null,
  phone: Object.create(null), visitsPhone: null }; // (v126 speed, part 3: phone[k] — the text came from this phone's copy at the early open; visitsPhone — the copy of the visits it drew)
const ON_SCREEN = { clinics: () => clinics, products: () => products, tasks: () => tasks, dayPlans: () => dayPlans, staff: () => staff, recycleBin: () => recycleBin,
  benchmarks: () => BENCHMARKS, events: () => events, targets: () => targets, categoryGuides: () => categoryGuides, erpMap: () => erpMap, erpNotes: () => erpNotes,
  rxTypes: () => rxTypesDoc, visits: () => visits, erpSales: () => erpSales };
// The deletes known for a list, as one short string: what its copy on screen was filtered with (the clinics: the
// doctors' too). Order-free; a delete added, let go or held changes it.
function tombsFp(key){
  const one = k => { const s = tombsView(k); if(!s || !s.size) return '0'; let h = 0; s.forEach(id => { const t = String(id); let x = 7; for(let i = 0; i < t.length; i++) x = (Math.imul(x, 31) + t.charCodeAt(i)) | 0; h = (h + x) | 0; }); return s.size + ':' + h; };
  return key === 'clinics' ? one('clinics') + '/' + one('doctors') : one(key);
}
function onScreenWho(){ return currentUser ? currentUser.name + '|' + currentUser.role : ''; }
// The copy on screen is no longer what a read gave (a sign-out, a start that went wrong): the next refresh takes every list again.
function onScreenForget(){ _onScreen.gen = null; _onScreen.drawn = null; _onScreen.visits = null; _onScreen.erpSales = null; _onScreen.visitsPhone = null; ['texts', 'ids', 'refs', 'tfp', 'phone'].forEach(f => { _onScreen[f] = Object.create(null); }); }
async function loadAllNow(opts){
  // opts.local: the early open (v126 speed, part 3) — this phone's copy only, as an offline start that did not try: no
  // cloud read, nothing written, and nothing put on screen unless the copy is whole (→ 'drawn', else 'nocopy' / 'gone')
  const local = opts && opts.local ? opts.local : null;
  const run = { failed: {}, mirror: {}, local: !!local, none: local ? local.none : null }; // this refresh's own read flags (v123)
  // the start's reads asked for at the sign-in's confirmation (prefetchStart): taken here, with the counters of their time
  const pf = !local && _prefetch ? _prefetch : null;
  if(pf){ _prefetch = null; run.pf = pf; }
  if(!local) _copyTombs = null; // a read from the cloud: the deletes are the log's from now on (what the early open drew was filtered with the copy's)
  const lf = run.failed, mu = run.mirror;
  let crashed = false;
  if(local){ if(_early !== local || local.state === 'gone') return 'gone'; currentUser = local.user = { name: local.name, role: local.role }; }
  // what this refresh took anew (v126 speed): nothing → the screen is not drawn again; the copies it kept as they were
  let took = new Set(), raced = false, clinicsKept = false, visitsKept = false, phoneVisits = false, erpKept = false, teamP = null, teamBefore = null, gen0 = _localGen;
  let c0, p0, t0, dp0, st0, rb0, bm0, ev0, tg0, cg0, em0, en0, rt0; // what each read gave (the copy's mark: the documents the cloud did not have)
  const who = onScreenWho();
  try{
    const mapGen0 = pf ? pf.mapGen : _erpMapGen; // a link saved while this read runs is newer than what it brings back
    const rxGen0 = pf ? pf.rxGen : _rxTypesGen; // likewise a prescription-types save
    gen0 = pf ? pf.gen : _localGen; // likewise any list saved here (v121) — since the reads were asked for (prefetchStart)
    const erpGen0 = pf ? pf.erpGen : _erpSaveGen; // likewise a sales save
    const heldSettled = heldSettledNow(); // the deletes held long enough as these reads begin: a read of the list may confirm them (round 3)
    if(!local) dropQueuedErpMap();        // before cloudGet: a queued key would make it serve this device's stale copy
    const g = k => cloudGet(k, null, run);
    const tombsP = run.tombsP = local ? Promise.resolve('local') : refreshTombs(run); // the team's delete log (the early open: this phone's), read alongside the lists so a deleted record never reaches the screen (loadVisits waits on it before a kept month stands in for a read, v126)
    if(!local && _onScreen.visitsPhone){
      run.readFirst = true; // the first read after an early open: every past month from the cloud at once (loadVisits)
      // its reads are on their way (prefetchStart): what they bring is looked at once the early open's figures are painted
      // — the screen first, then the comparison (on a phone the reads take longer than both)
      await earlyPainted();
    }
    const listsP = Promise.all([
      g('clinics'),
      g('products'),
      loadVisits(run), // live month + archived months, assembled (see persistVisits)
      g('tasks'),
      g('dayPlans'),
      g('staff'),
      g('recycleBin'),
      g('benchmarks'),
      g('events'),
      g('targets'),
      g('categoryGuides'),
      loadErpSales(run), // index document + row chunks, assembled (see persistErpSales)
      g('erpMap'),
      g('erpNotes'),
      g('rxTypes'), // the supervisor's prescription types — read only; never seeded, never written from here
      tombsP,
    ]);
    // Chat and memories (v126 speed): read beside the lists only when due — every refresh while their screen is open,
    // else at TEAM_PACE_MS (teamDue, 12-reports.js); never waited for before the screen is drawn (their ~1 MB held back
    // the first paint of every start). Nothing below reads them, and loadTeam keeps its own guards (_teamGen /
    // _teamSaving per list); the refresh ends once it is in.
    teamFromPhone(); // the lists the screen shows until a read: this phone's copy of the last one
    const teamKeys = local ? [] : teamDue(!_cloudRead); // (the first read from the cloud is the start's, after an early open too)
    teamBefore = { chat: chatMsgs, memories }; // what memory held as the read began: drawn again only if it changed (teamRead)
    teamP = teamKeys.length ? loadTeam(teamKeys) : null;
    if(teamP) teamP.catch(() => {});
    const [c,p,v,t,dp,st,rb,bm,ev,tg,cg,es,em,en,rt] = await listsP;
    [c0, p0, t0, dp0, st0, rb0, bm0, ev0, tg0, cg0, em0, en0, rt0] = [c, p, t, dp, st, rb, bm, ev, tg, cg, em, en, rt];
    if(local){
      // the early open puts nothing on screen unless the copy is whole — every list in it (or known not to exist), the
      // visits a whole list, every sales file with its rows — and it is still wanted (no one else signed in meanwhile)
      if(_early !== local || local.state === 'gone') return 'gone';
      if(Object.keys(lf).length || !Array.isArray(UMCore.safeParse(c && c.value, null)) || !Array.isArray(v) || run.erpIncomplete){
        console.warn('early open: this phone\'s copy is not whole — the start reads the cloud first', Object.keys(lf), run.erpIncomplete || '');
        if(currentUser === local.user) currentUser = null;
        return 'nocopy';
      }
    }
    // The flags of a list this refresh puts on screen become the screen's.
    const adopt = k => { if(lf[k]) _loadFailed[k] = true; else delete _loadFailed[k]; if(mu[k]) _mirrorUsed[k] = true; else delete _mirrorUsed[k]; };
    // Each key parses independently: one corrupt entry falls back alone instead
    // of throwing and resetting every collection to seed data.
    const notDeleted = key => { const ts = local ? tombsView(key) : tombSet(key); return x => !(x && ts.has(x.id)); }; // (the early open: as the screen was filtered at the copy's read)
    // What a list read FROM THE CLOUD now (a document that exists; never the
    // phone's copy, never a read that failed) says about the deletes this phone
    // holds although the log no longer has them (reconcileTombs): the list holds
    // the record → the hold is let go (v123 review); it does not, and the hold
    // has stood long enough → the delete goes back to the log now (round 3).
    // Likewise a record the list holds under a delete published again: it stays.
    const fromCloud = k => !lf[k] && !mu[k];
    let tombsToWrite = 0;
    const settleHeld = (k, ids) => {
      if(!fromCloud(k) || !ids) return;
      const has = id => ids.has(id);
      tombsToWrite += reviveAgainTombs(k, has);
      tombsToWrite += settleHeldTombs(k, has, heldSettled[k]);
    };
    // A list saved here while these reads were on their way (v121): what came
    // back is older than memory. Assigned, the older copy showed — and the
    // next save of that list wrote it over the cloud. Every list stays as it
    // is on screen, with the read flags it was loaded under, and goes back
    // into the phone's copy (the read overwrote it); the next refresh reads again.
    raced = _bootLoaded && savedSince(gen0);
    if(raced){
      console.warn('refresh: a save ran while it read — the lists on screen are kept; the next refresh reads again');
      const onPhone = (k, val) => { if(_loadFailed[k]) return; const str = JSON.stringify(val); mirrorSave(k, str); if(WHOLE_DOCS.includes(k)) keepDocBaseOnPhone(k, str); }; // never defaults over a real copy
      if(!_seedClinics) onPhone('clinics', storedClinics());
      if(!_loadFailed.visits) visitsMirrorSave(visits);
      onPhone('products', products); onPhone('tasks', tasks); onPhone('dayPlans', dayPlans); onPhone('events', events);
      onPhone('targets', targets); onPhone('staff', staff); onPhone('recycleBin', recycleBin); onPhone('benchmarks', BENCHMARKS);
      onPhone('categoryGuides', categoryGuides); onPhone('erpNotes', erpNotes);
      // that copy may hold an edit whose save is still on its way: keep beside it the base the
      // cloud last confirmed, so a reopen without a connection still counts the edit as this phone's
      ['clinics', 'tasks', 'events', 'dayPlans', 'visits'].forEach(k => { if(!_loadFailed[k] && !(k === 'clinics' && _seedClinics)) keepMergeBaseOnPhone(k); });
    }
    // v126 speed: a document read exactly as the copy on screen was taken from it (_onScreen) is kept as it is — not
    // parsed, filtered or merged again; it still counts as this refresh's read from the cloud (its flags are adopted
    // below as every list's; the held deletes it answers for are settled from the ids that text holds)
    const sameBase = !raced && _bootLoaded && !_bootCrashed && !_seedClinics && _onScreen.gen === gen0 && _onScreen.who === who;
    const textOf = r => r && typeof r.value === 'string' ? r.value : null;
    const sameText = (k, r) => sameBase && !local && fromCloud(k) && !outboxHas(k) && (k in _onScreen.texts) && _onScreen.texts[k] === textOf(r) && _onScreen.refs[k] === ON_SCREEN[k]()
      && (k !== 'erpMap' || _onScreen.mapGen === _erpMapGen) && (k !== 'rxTypes' || _onScreen.rxGen === _rxTypesGen);
    const parsed = Object.create(null); // each document parsed at most once by this refresh
    const docOf = (k, r, dflt) => (k in parsed) ? parsed[k] : (parsed[k] = UMCore.safeParse(r && r.value, dflt));
    const keptAs = k => _onScreen.tfp[k] === tombsFp(k); // the deletes known for it are those its copy on screen was filtered with
    const clinicsSame = sameText('clinics', c);
    const clinicsBefore = clinics;
    if(!raced){
    Object.keys(LOCAL_KEYS).forEach(k => { if(k !== 'visits' || !_visitsSaving) adopt(k); });
    // No clinic list ships with the app (the code is public, v121): an account
    // without one starts empty and builds it (Admin → Manage clinics → Import,
    // or Territory → Upload a clinic distribution).
    if(clinicsSame) settleHeld('clinics', _onScreen.ids.clinics);
    else { const cd = docOf('clinics', c, null); if(c && c.value != null && Array.isArray(cd)) settleHeld('clinics', idsOfList(cd)); }
    clinicsKept = clinicsSame && keptAs('clinics');
    if(!clinicsKept){
      const clinicsDoc = docOf('clinics', c, null);
      clinics = normalizeClinics((clinicsDoc || []).filter(notDeleted('clinics')).map(x => dropTombedDoctors(x, local ? tombsView('doctors') : undefined)));
      // nothing read (the read failed with no copy here, or the document is not a list):
      // never allowed to overwrite live data; a real read of no document is a new account
      _seedClinics = !clinicsDoc && !(!c && !lf.clinics && !mu.clinics);
      if(clinicsDoc) reinsertKeptClinics(clinicsBefore); // a branch saved while this read was on its way stays
      took.add('clinics');
    }
    if(!sameText('products', p)){ products = docOf('products', p, null) || PRODUCTS_SEED; assignProductKeys(); took.add('products'); }
    if(!_visitsSaving){
      // the visits on screen are those texts already (loadVisits: run.visitsSame) — kept, unless the deletes known for
      // them or the doctor merges changed since (a merge is applied once, to the visits as read: applyDoctorRemap)
      visitsKept = !!run.visitsSame && !!_onScreen.visits && keptAs('visits') && _onScreen.visits.remap === JSON.stringify(doctorMergesRemap());
      const vv = run.visitsSame && !visitsKept ? run.visitsLater() : v;
      if(visitsKept){ if(fromCloud('visits')) settleHeld('visits', _onScreen.visits.ids); } // every month read from the cloud: a hold is answered
      else {
      if(run.visitsCommit) run.visitsCommit();
      // a month that did not load confirms nothing: what was read still lets a hold go
      // (a visit only a month from the phone's store holds says nothing of the cloud: left out, v126 review)
      const vc = Array.isArray(vv) && run.visitsKeptOnly && run.visitsKeptOnly.size ? vv.filter(x => !(x && run.visitsKeptOnly.has(x.id))) : vv;
      if(fromCloud('visits') && Array.isArray(vc)){ if(_visitsBroken.length || !run.visitsComplete){ const ids = idsOfList(vc); releaseHeldTombs('visits', heldIdsIn('visits', vc)); tombsToWrite += reviveAgainTombs('visits', id => ids.has(id)); } else settleHeld('visits', idsOfList(vc)); }
      // after the early open (v126 speed, part 3): what was put together now is exactly the copy it drew — the same
      // text, the same deletes known, the same doctor merges, nothing saved here since — so the visits on screen stay
      const ph = _onScreen.visitsPhone;
      phoneVisits = !local && !!ph && sameBase && fromCloud('visits') && !outboxHas('visits') && !_visitsBroken.length && typeof run.visitsAllText === 'string'
        && run.visitsAllText === ph.text && ph.ref === visits && ph.tfp === tombsFp('visits') && ph.remap === JSON.stringify(doctorMergesRemap());
      if(phoneVisits) visitsKept = true;
      else { visits = (Array.isArray(vv) ? vv : []).filter(notDeleted('visits')); took.add('visits'); }
      run.visitsIdsRead = Array.isArray(vc) ? idsOfList(vc) : null;
      }
    } // the base moves with the visits on screen (v123 review)
    const tasksSame = sameText('tasks', t), eventsSame = sameText('events', ev), plansSame = sameText('dayPlans', dp);
    if(tasksSame) settleHeld('tasks', _onScreen.ids.tasks); else { const d = docOf('tasks', t, []); if(t && t.value != null && Array.isArray(d)) settleHeld('tasks', idsOfList(d)); }
    if(eventsSame) settleHeld('events', _onScreen.ids.events); else { const d = docOf('events', ev, []); if(ev && ev.value != null && Array.isArray(d)) settleHeld('events', idsOfList(d)); }
    if(plansSame) settleHeld('dayPlans', _onScreen.ids.dayPlans); else { const d = docOf('dayPlans', dp, {}); if(dp && dp.value != null && d && typeof d === 'object') settleHeld('dayPlans', planKeysOf(d)); }
    if(!(tasksSame && keptAs('tasks'))){ const d = docOf('tasks', t, []); tasks = (Array.isArray(d) ? d : []).filter(notDeleted('tasks')); took.add('tasks'); }
    if(!(eventsSame && keptAs('events'))){ const d = docOf('events', ev, []); events = (Array.isArray(d) ? d : []).filter(notDeleted('events')); took.add('events'); }
    if(!plansSame){ dayPlans = docOf('dayPlans', dp, {}); took.add('dayPlans'); }
    // The base of the next three-way merge: a real read is exactly what the
    // screen now shows; a key waiting in the queue keeps what the cloud last
    // confirmed (kept on the phone when it was queued — a reopened phone).
    [['clinics', c], ['tasks', t], ['events', ev], ['dayPlans', dp]].forEach(([k, r]) => {
      if(!took.has(k) && !_onScreen.phone[k]) return; // kept (read from the cloud, nothing queued): its base is that very text already (the early open's copy: the read's text now)
      const fromRead = k === 'dayPlans' ? JSON.stringify(dayPlans) : (r && r.value != null ? r.value : null);
      if(!lf[k] && !mu[k]){ if(k === 'dayPlans') _dpBase = fromRead; else setMergeBase(k, fromRead); if(!outboxHas(k)) dropMergeBaseOnPhone(k); }
      else if(outboxHas(k)) mergeBaseFromPhone(k);
      // read from the phone's copy (offline start, or the read failed) and nothing queued:
      // that copy is what this phone last saw the cloud hold — the base, so the next save
      // never puts back this phone's copy of records it did not touch (day plans too, v123)
      else if(!(k === 'dayPlans' ? _dpBase != null : mergeBaseFor(k)) && r && r.value != null){
        mergeBaseFromPhone(k);
        if(k === 'dayPlans'){ if(_dpBase == null) _dpBase = fromRead; }
        else if(!mergeBaseFor(k)) setMergeBase(k, r.value);
      }
    });
    if(!sameText('targets', tg)){ targets = docOf('targets', tg, {}); took.add('targets'); }
    // Merge so newly seeded categories appear even for users with a saved copy,
    // while supervisor edits to existing categories win over the seed.
    if(!sameText('categoryGuides', cg)){
      const cgVal = docOf('categoryGuides', cg, null);
      categoryGuides = Object.assign({}, JSON.parse(JSON.stringify(CATEGORY_GUIDES_SEED)), cgVal || {});
      took.add('categoryGuides');
    }
    // What each whole document on screen came from: the base of its compare-and-set
    // (a copy served from the phone takes what the phone kept beside it after a save
    // that did not land, else that copy itself).
    [['products', p], ['targets', tg], ['staff', st], ['recycleBin', rb], ['benchmarks', bm], ['categoryGuides', cg], ['erpNotes', en]].forEach(([k, r]) => {
      wholeDocSentForget(k); // what memory holds is this read's from here on (persistNowInner's own texts no longer in it)
      if(lf[k]){ delete _docLoaded[k]; return; }
      if(mu[k]){ const kept = docBaseFromPhone(k); _docLoaded[k] = kept !== undefined ? kept : (r && r.value != null ? r.value : null); return; }
      _docLoaded[k] = r && r.value != null ? r.value : null;
      dropDocBaseOnPhone(k);
    });
    } // !raced
    // the held deletes this read confirmed go back to the log now — not at this
    // phone's next delete (round 3): a phone with an old copy uploading later is held back by it
    if(tombsToWrite) await publishConfirmedTombs();
    if(_erpSaving || _erpDirty || erpGen0 !== _erpSaveGen) console.warn('erpSales: refresh skipped — a save is in flight or unsaved edits exist');
    else { erpKept = es === erpSales && !!run.erpSame; if(!erpKept){ erpAdoptLoaded(es); took.add('erpSales'); } adopt('erpSales'); } // already assembled: periods carry their rows (the same files as on screen: kept)
    // An account link confirmed by the cloud while this read was on its way
    // (or a link save still in flight) is newer than the copy read here: keep
    // it, and keep the device copy on it, instead of showing the old link for
    // a whole refresh cycle.
    if(!_erpLinkSaving && mapGen0 === _erpMapGen){ if(!sameText('erpMap', em)){ erpMap = docOf('erpMap', em, {}) || {}; took.add('erpMap'); } adopt('erpMap'); }
    else {
      console.warn('erpMap: refresh skipped — an account link was saved while it read');
      mirrorSave('erpMap', JSON.stringify(erpMap));
      delete _loadFailed.erpMap; delete _mirrorUsed.erpMap; // memory holds the copy the cloud confirmed
    }
    if(!raced && !sameText('erpNotes', en)){ erpNotes = docOf('erpNotes', en, {}) || {}; took.add('erpNotes'); }
    // Prescription types: a read that failed keeps what memory had (a fresh
    // phone then shows the built-in forms with a note); a document that does
    // not exist yet is null (the built-in forms); a save confirmed while this
    // read ran is newer than what it brings back.
    adopt('rxTypes');
    if(!lf.rxTypes){
      if(!_rxSaving && rxGen0 === _rxTypesGen){
        if(!sameText('rxTypes', rt)){
          const rtVal = docOf('rxTypes', rt, null);
          rxTypesDoc = rtVal && typeof rtVal === 'object' ? rtVal : null;
          took.add('rxTypes');
        }
      } else {
        console.warn('rxTypes: refresh skipped — the list was saved while it read');
        // Memory holds the list the cloud confirmed after this read began; the
        // read itself already wrote its older copy to the device — put the
        // confirmed one back, so the next start without a connection shows it.
        if(rxGen0 !== _rxTypesGen && rxTypesDoc){ mirrorSave('rxTypes', JSON.stringify(rxTypesDoc)); delete _mirrorUsed.rxTypes; }
      }
    }
    if(!lf.rxTypes) _rxTypesRead = 'read'; else if(_rxTypesRead !== 'read') _rxTypesRead = 'failed';
    if(typeof rxTypesRefreshed === 'function'){ try{ rxTypesRefreshed(); }catch(e){ console.warn('types editor refresh', e); } } // a types editor waiting for the list (10)
    const stVal = raced || sameText('staff', st) ? null : docOf('staff', st, null);
    if(stVal){ staff = stVal; refreshStaff(); took.add('staff'); }
    const rbVal = raced || sameText('recycleBin', rb) ? null : docOf('recycleBin', rb, null);
    if(rbVal){ recycleBin = Object.assign({clinics:[],products:[],visits:[]}, rbVal); took.add('recycleBin'); }
    const bmVal = raced || sameText('benchmarks', bm) ? null : docOf('benchmarks', bm, null);
    if(bmVal){ BENCHMARKS = Object.assign({}, BENCHMARKS, bmVal); took.add('benchmarks'); }
    // What is on screen now, and the cloud's text it came from (_onScreen): only for a refresh that took its lists
    // (never one that kept them because a save ran while it read), only for what it read from the cloud
    if(!raced){
      // the early open records the phone's texts (v126 speed, part 3): the start's read finds a list the same when the cloud
      // holds that very text (_onScreen.phone: the base then still moves to the read's text)
      const rec = (k, r, ids) => {
        if(!(fromCloud(k) || (local && mu[k])) || outboxHas(k)){ delete _onScreen.texts[k]; delete _onScreen.phone[k]; return; }
        _onScreen.texts[k] = textOf(r); _onScreen.refs[k] = ON_SCREEN[k](); _onScreen.tfp[k] = tombsFp(k);
        if(local) _onScreen.phone[k] = true; else delete _onScreen.phone[k];
        if(ids !== undefined) _onScreen.ids[k] = ids;
      };
      const idsIf = (k, r, f) => k in parsed ? (r && r.value != null && Array.isArray(parsed[k]) ? f(parsed[k]) : null) : _onScreen.ids[k];
      rec('clinics', c, idsIf('clinics', c, idsOfList)); rec('products', p);
      rec('tasks', t, idsIf('tasks', t, idsOfList)); rec('events', ev, idsIf('events', ev, idsOfList));
      rec('dayPlans', dp, 'dayPlans' in parsed ? (dp && dp.value != null && dayPlans && typeof dayPlans === 'object' ? planKeysOf(dayPlans) : null) : _onScreen.ids.dayPlans);
      rec('targets', tg); rec('categoryGuides', cg); rec('staff', st); rec('recycleBin', rb); rec('benchmarks', bm); rec('erpNotes', en);
      if(!_erpLinkSaving && mapGen0 === _erpMapGen) rec('erpMap', em); else delete _onScreen.texts.erpMap;
      if(!lf.rxTypes && !_rxSaving && rxGen0 === _rxTypesGen) rec('rxTypes', rt); else delete _onScreen.texts.rxTypes;
      _onScreen.mapGen = _erpMapGen; _onScreen.rxGen = _rxTypesGen;
      // the visits: the live month and the index they were put together from (every month at the revision on screen,
      // read from the cloud: none from the phone's store, none unreadable); recorded once the doctor merges are applied
      if(_visitsSaving || !fromCloud('visits') || outboxHas('visits')) _onScreen.visits = null;
      else if(!visitsKept || phoneVisits) _onScreen.visits = run.visitsTexts && run.visitsComplete && !_visitsBroken.length && !(run.visitsKeptOnly && run.visitsKeptOnly.size) && !keptMonthsOnScreen()
        ? { live: run.visitsTexts.live, idx: run.visitsTexts.idx, ids: run.visitsIdsRead, complete: true, remap: null } : null;
      // the sales files: the index they were put together from, every file's rows in hand (the early open: the index text
      // kept beside the phone's copy)
      if(_erpSaving || _erpDirty || !(fromCloud('erpSales') || (local && mu.erpSales))) _onScreen.erpSales = null;
      else if(!erpKept) _onScreen.erpSales = run.erpText != null && !_erpBroken.length && !_erpPutBack ? { text: run.erpText } : null;
      _onScreen.refs.erpSales = erpSales;
      _onScreen.gen = gen0; _onScreen.who = who;
    }
    // The flags of the copy on screen (this refresh's, for the lists it put there).
    const readOk = k => !_loadFailed[k] && !_mirrorUsed[k];
    // Doctors the supervisor merged by tap: a visit that still names the merged
    // record shows the kept one. Memory only — nothing is written at start
    // (v123; until v122 the supervisor's phone collapsed same-name doctors and
    // wrote the clinic list back at every refresh).
    if(!visitsKept) applyDoctorRemap(); // (kept visits had it applied when they were taken: applying it twice could follow a chain of merges)
    if(_onScreen.visits && (!visitsKept || phoneVisits)){ _onScreen.visits.remap = JSON.stringify(_docRemap); _onScreen.refs.visits = visits; _onScreen.tfp.visits = tombsFp('visits'); }
    // what the early open drew of the visits: the phone's copy as text, beside the deletes and doctor merges it was drawn with
    if(!raced) _onScreen.visitsPhone = local && mu.visits && !outboxHas('visits') && typeof run.visitsPhoneText === 'string'
      ? { text: run.visitsPhoneText, ref: visits, tfp: tombsFp('visits'), remap: JSON.stringify(_docRemap) } : null;
    if(!local) archiveTargetsMonth(); // a finished month's target/achieved figures are kept, not lost to rollover
    // A missing settings document gets its factory default only from the
    // supervisor's phone, only when this refresh itself read the cloud and found
    // no document, and only as a compare-and-set that the document still does
    // not exist (persistNow, a transaction on the server) — never from a rep's
    // phone, nor from one whose read failed or was served from its own copy
    // (v123: a rep's phone whose read had timed out wrote the factory catalog).
    const seedOk = k => !local && !raced && currentUser && currentUser.role === 'supervisor' && !lf[k] && !mu[k] && !_loadFailed[k] && !_mirrorUsed[k];
    const quiet = { quietConflict: true }; // another phone created it meanwhile: the next refresh shows it
    if(!p && seedOk('products')) await persist('products', quiet);
    if(!st && seedOk('staff')) await persist('staff', quiet);
    if(!bm && seedOk('benchmarks')) await persist('benchmarks', quiet);
    if(!cg && seedOk('categoryGuides')) await persist('categoryGuides', quiet);
    if(!local && currentUser && currentUser.role === 'supervisor' && !_loadFailed.erpSales && !_mirrorUsed.erpSales && !erpKept) await purgeIgnoredSalesmen(); // (kept files: as last time)
    if(!local && took.has('products')) await applyProductImgSeed();
  }catch(e){
    // A late failure (team load, a seed) must NOT throw away collections that
    // already parsed fine — only fill in whatever is still missing.
    console.error('load error', e);
    crashed = true;
    if(!Array.isArray(clinics) || !clinics.length){ clinics = []; _seedClinics = true; }
    if(!Array.isArray(products) || !products.length) products = PRODUCTS_SEED;
    if(!Array.isArray(visits)) visits = [];
    if(!Array.isArray(tasks)) tasks = [];
    if(!dayPlans || typeof dayPlans !== 'object') dayPlans = {};
    if(!categoryGuides) categoryGuides = JSON.parse(JSON.stringify(CATEGORY_GUIDES_SEED));
  }
  if(local && (crashed || _early !== local || local.state === 'gone')){ // the early open draws nothing: the start goes on as before
    if(crashed) onScreenForget();
    if(currentUser === local.user) currentUser = null;
    return crashed ? 'nocopy' : 'gone';
  }
  // signed out while this read was on its way (the sign-in screen is up — the copy's screen can be signed out of before
  // the start's read is in, v126 speed part 3): nothing is drawn for it; the next sign-in reads again
  if(!currentUser) return;
  _bootCrashed = crashed;
  if(crashed) onScreenForget();
  if(!clinicsKept || crashed) hidePlaceholderClinics();
  if(!raced && !crashed && _onScreen.texts.clinics !== undefined) _onScreen.refs.clinics = clinics; // (a new list: hidePlaceholderClinics)
  // Rep filters default once per sign-in; the background refresh keeps
  // whatever the supervisor has selected (a rep is always pinned to herself).
  if(_filtersFor !== currentUser.name || currentUser.role === 'rep'){
    clinicRepFilter = currentUser.role==='rep' ? currentUser.name : 'all';
    reportRepFilter = currentUser.role==='rep' ? currentUser.name : 'all';
    calRepFilter = currentUser.role==='rep' ? currentUser.name : 'all';
    _filtersFor = currentUser.name;
  }
  // Nothing new (v126 speed): the screen stays exactly as it is — not drawn again; only the words that follow the
  // clock move (msClock: the hour's greeting and figures, "5 min ago"). A new day draws everything.
  const drawnFor = who + '|' + todayStr();
  if(local){
    // the early open draws now, as a sign-in shows the app (selectUser) — with the line that says what the screen is
    _bootLoaded = true; // real, loaded state (an offline start's): a save from here on is told apart from what a refresh reads
    local.state = 'drawn';
    document.getElementById('gate').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('bottomNav').style.display = 'flex';
    welcomeDismissed = false;
    renderAll(); _onScreen.drawn = drawnFor; _onScreen.hour = new Date().getHours();
    copyLineSet('updating');
    updateSyncBadge();
    return 'drawn';
  }
  if(crashed || raced || took.size || _onScreen.drawn !== drawnFor){ renderAll(); _onScreen.drawn = drawnFor; _onScreen.hour = new Date().getHours(); }
  else if(typeof msClock === 'function') msClock();
  _bootLoaded = true;
  updateSyncBadge();
  checkWipeBanner(); // fire-and-forget: reads the daily backups at most once a day, only when the list looks wiped (13)
  if(typeof checkPendingRename === 'function') checkPendingRename(); // a rename this phone started and the app was closed on (08-team-orders.js, round 3)
  // The past months this refresh put on screen from the phone's store are read from the cloud before it ends (v126
  // review): they stood in for the first paint only. First in the visits save chain, so a save waiting behind it runs
  // on what the cloud holds; a read that fails leaves them kept, and the next refresh reads them (loadVisits).
  const confirmP = keptMonthsOnScreen() ? visitsConfirmKept() : null;
  _refreshFlush = flushOutbox(); // anything saved offline goes up now, merged with the cloud (the 20-second round waits for it: bgRefresh)
  if(confirmP){
    try{ const r = await confirmP; if(r.changed) renderAll(); if(r.unread.length) console.warn('visits: ' + r.unread.join(', ') + ' (kept on this phone) not read from the cloud yet — the next refresh reads them'); }
    catch(e){ console.warn('visits: the past months kept on this phone could not be read from the cloud yet', e); }
  }
  if(_keptForSnap && !keptOnScreen()){ _keptForSnap = false; maybeSnapshot(); } // the daily backup waited for those months (v126)
  // v126 speed, part 3: the phone's copy is the cloud's as of now when every list came from the cloud (what a start may draw
  // from); the early open's window ends with this session's first read, and its line goes once every list on screen came
  // from the cloud — a read that failed is said so until a later one is in
  if(!raced) copyMark(run, [['clinics', c0], ['products', p0], ['tasks', t0], ['dayPlans', dp0], ['staff', st0], ['recycleBin', rb0], ['benchmarks', bm0], ['events', ev0], ['targets', tg0], ['categoryGuides', cg0], ['erpMap', em0], ['erpNotes', en0], ['rxTypes', rt0]]);
  _cloudRead = true;
  if(_early && _early.state === 'drawn' && !_early.lineDone){
    if(!raced) _early.done = true;
    const phone = Object.keys(_mirrorUsed).some(k => !outboxHas(k)) || Object.keys(_loadFailed).length > 0 || keptMonthsOnScreen();
    if(!phone){ _early.lineDone = true; copyLineSet(null); } // (once a read is in, the line never comes back: it is about the start)
    else copyLineSet(raced ? 'updating' : 'failed');
  }
  if(teamP){ try{ await teamP; }catch(e){} teamRead(teamBefore); } // chat and memories: drawn where they show, once in (12-reports.js)
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
// The phone's copies of the visits and the sales files (v126 speed): a refresh that finds the same text writes no copy,
// so a copy that fell back on a full phone (the visits' quarter, the sales' slim copy or bare index, the sales rows
// dropped for room) would stay so — and a nearly full phone would then have no rows left to drop for an offline visit
// (sync-safety 4d). A copy that was whole this session and fell back is put together and written whole again by the next
// refreshes, as every refresh did before: the next ten at once, then every five minutes (mirrorRetryDue). Not one that
// never fitted this session, nor the sales rows dropped to make room for a copy that then landed (deviceSet: the room
// is that copy's — written back, the rows would push it out again; a heavy year's rows: the store keeps them).
//   _mirrorWhole[k]  its last write was the whole list     _mirrorWas[k]  a whole write landed this session
//   _mirrorRetry[k]  { n: writes that fell back since it was whole, at: the last one }
const _mirrorWhole = {}, _mirrorWas = {}, _mirrorRetry = {};
const MIRROR_RETRY_MS = 300000;
function mirrorNoteWrite(k, whole){
  if(whole){ _mirrorWhole[k] = true; _mirrorWas[k] = true; delete _mirrorRetry[k]; return; }
  _mirrorWhole[k] = false;
  const r = _mirrorRetry[k] || (_mirrorRetry[k] = { n: 0, at: 0 }); r.n++; r.at = Date.now();
}
function mirrorRetryDue(k){
  if(_mirrorWhole[k] || !_mirrorWas[k]) return false;
  const r = _mirrorRetry[k];
  return !r || r.n < 10 || Math.abs(Date.now() - r.at) >= MIRROR_RETRY_MS;
}
const _memOnly = new Set();   // queued saves the phone could not keep (bar until they upload)
function deviceSet(k, v, mayFree){
  try{ localStorage.setItem(k, v); return true; }catch(e){}
  if(mayFree && freeDeviceRoom()){ try{ localStorage.setItem(k, v); _mirrorWas.erpSales = false; return true; }catch(e){} } // (the room is this copy's: see _mirrorWhole)
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
  mirrorNoteWrite('erpSales', false);
  try{ localStorage.setItem('um_mirror:erpSales', JSON.stringify(Object.assign({}, m, { periods }))); }
  catch(e){ try{ localStorage.removeItem('um_mirror:erpSales'); }catch(e2){ return false; } }
  console.warn(`device storage full: ${freed} sales rows dropped from this phone's copy — they download again from the cloud`);
  return true;
}
function mirrorSave(key, str){
  if(deviceSet('um_mirror:' + key, str, key !== 'erpSales')){ delete _deviceStale[key]; return true; }
  _deviceStale[key] = true;
  copyStale(); // the phone's copy is not the one a start may draw from any more (v126 speed, part 3)
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
    el.className = 'sbar sbar-wide sbar-danger';
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
// tombstones: {docKey: {id: deletedAtMs}} kept 120 days (v123; 7 until then: a
// phone whose copy was older than a week put a deleted record back)
const TOMB_KEEP_MS = 120 * 86400000;
// An older app version (v122 and before) still rewrites the shared log with a
// 7-day cutoff: a delete older than that may be missing from the log without
// anyone having brought the record back (reconcileTombs, v123 review).
const OLD_TOMB_CUT_MS = 7 * 86400000;
// The first start of v123 on a phone (round 3, once — um_tombsMig123): v122
// IGNORED this phone's own deletes older than 7 days but never pruned them
// from um_tombs. Read back as live deletes for 120 days, the old deletes of
// records the team brought back since (bin restores, whole-day restores, the
// August–September repairs) deleted them again, everywhere. They had expired
// under v122 and are dropped once, as v122 treated them; doctor removals are
// kept for good, as before (v121).
const TOMBS_MIG = 'um_tombsMig123';
const _tombsLocalAt = {}; // key → { id: when this phone deleted it } (um_tombs): reconcileTombs reads the age
const _tombstones = (()=>{
  const out = { visits:new Set(), tasks:new Set(), clinics:new Set(), events:new Set(), dayPlans:new Set(), doctors:new Set() };
  try{
    let raw = JSON.parse(localStorage.getItem('um_tombs')||'{}');
    if(!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    let migrated = false; try{ migrated = localStorage.getItem(TOMBS_MIG) === '1'; }catch(e){}
    if(!migrated){
      const cut = Date.now() - OLD_TOMB_CUT_MS;
      let dropped = 0;
      Object.keys(raw).forEach(k => {
        if(k === 'doctors' || !raw[k] || typeof raw[k] !== 'object') return;
        Object.keys(raw[k]).forEach(id => { if(!(+raw[k][id] > cut)){ delete raw[k][id]; dropped++; } });
      });
      // in memory at once; on the phone with the flag (a write that fails is done again at the next start)
      try{ if(dropped) localStorage.setItem('um_tombs', JSON.stringify(raw)); localStorage.setItem(TOMBS_MIG, '1'); }catch(e){}
      if(dropped) console.warn(`delete log: ${dropped} of this phone's deletes older than 7 days left out (they had expired under v122)`);
    }
    const cutoff = Date.now() - TOMB_KEEP_MS;
    // doctor removals are kept for good (v121): after 7 days a removed doctor would
    // otherwise come back as "lost" on the Doctors-without-a-name sheet
    Object.keys(out).forEach(k=>Object.keys(raw[k]||{}).forEach(id=>{ if(k === 'doctors' || raw[k][id] > cutoff){ out[k].add(id); (_tombsLocalAt[k] = _tombsLocalAt[k] || {})[id] = +raw[k][id] || 0; } }));
  }catch(e){}
  return out;
})();
let tombsDoc = { visits:{}, tasks:{}, clinics:{}, events:{}, dayPlans:{}, doctors:{} };
// Deletes made here that the shared log has not confirmed yet (offline, or a
// write still in flight) — the reconcile below must never drop these.
const _tombsUnpublished = {};
// …kept on the phone too (round 3, um_tombsUnpub). In memory only, a delete
// made with no signal was forgotten when the app was reopened before it
// uploaded: the first read of the log did not find it, took it for a record
// brought back elsewhere, and the record came back from the cloud. (A held
// delete on its way back to the log is not one of them: after a reopen it is
// held again, and confirmed again by a read of its list.)
const TOMBS_UNPUB = 'um_tombsUnpub';
let _unpubSaved = null;
function saveUnpubTombs(){
  try{
    const o = {};
    Object.keys(_tombsUnpublished).forEach(k => { const ids = [..._tombsUnpublished[k]].filter(id => !(_tombsPending[k] && _tombsPending[k].has(id))); if(ids.length) o[k] = ids; });
    const str = Object.keys(o).length ? JSON.stringify(o) : null;
    if(str === _unpubSaved) return;
    if(str) localStorage.setItem(TOMBS_UNPUB, str); else localStorage.removeItem(TOMBS_UNPUB);
    _unpubSaved = str;
  }catch(e){}
}
(() => {
  try{
    const str = localStorage.getItem(TOMBS_UNPUB);
    const o = str ? JSON.parse(str) : null;
    if(!o || typeof o !== 'object') return;
    _unpubSaved = str;
    Object.keys(o).forEach(k => {
      if(!_tombstones[k] || !Array.isArray(o[k])) return;
      o[k].forEach(id => {
        if(!_tombstones[k].has(id)) return; // no longer deleted on this phone
        (_tombsUnpublished[k] = _tombsUnpublished[k] || new Set()).add(id);
        (tombsDoc[k] = tombsDoc[k] || {})[id] = (_tombsLocalAt[k] || {})[id] || Date.now();
      });
    });
  }catch(e){}
})();
function tomb(key, id){
  if(!_tombstones[key] || id == null) return;
  _tombstones[key].add(id);
  (_tombsUnpublished[key] = _tombsUnpublished[key] || new Set()).add(id);
  (_tombsLocalAt[key] = _tombsLocalAt[key] || {})[id] = Date.now();
  if(_untombedAt[key]) delete _untombedAt[key][id];
  if(_untombed[key]) _untombed[key].delete(id); // revived here earlier: this new delete is published all the same (round 4)
  // deleted here and now: an ordinary delete of this phone's, whatever was held or marked for that id (round 3)
  [_tombsHeld, _tombsPending, _tombsAgain].forEach(m => { if(m[key]) m[key].delete(id); });
  try{
    const raw = JSON.parse(localStorage.getItem('um_tombs')||'{}');
    (raw[key] = raw[key] || {})[id] = Date.now();
    localStorage.setItem('um_tombs', JSON.stringify(raw));
  }catch(e){}
  (tombsDoc[key] = tombsDoc[key] || {})[id] = Date.now();
  saveUnpubTombs();
  persistTombs(); // fire-and-forget: share the delete with the whole team
}
// Bringing a record back to life must clear its tombstone EVERYWHERE — the
// in-memory set, this device's durable store, and the team's shared delete
// log — or the next merge/restart would silently delete it again.
function untomb(key, id, quiet){
  forgetTombHere(key, id);
  // one record brought back by a tap (the recycle bin, a clinic re-created): always written
  // down in the log (round 3), also when this phone knew no delete of it — a phone that holds
  // an old delete an older app cut from the log then lets it go at once, whatever the lists say
  if(_tombstones[key] && id != null){ const m = (_untombedAt[key] = _untombedAt[key] || {}); m[id] = Math.max(m[id] || 0, reviveTime(key, id)); }
  if(_tombstones[key]) _tombstones[key].delete(id);
  if(_tombsUnpublished[key]) _tombsUnpublished[key].delete(id);
  try{
    const raw = JSON.parse(localStorage.getItem('um_tombs')||'{}');
    if(raw[key] && raw[key][id] != null){ delete raw[key][id]; localStorage.setItem('um_tombs', JSON.stringify(raw)); }
  }catch(e){}
  if(tombsDoc[key]) delete tombsDoc[key][id];
  _untombed[key] = _untombed[key] || new Set(); _untombed[key].add(id);
  if(!quiet) persistTombs(); // share the revival like we share deletes
}
const _untombed = {}; // revived ids — the shared log must never re-absorb them
// …and when (v123 review): the log writes revivals down (revived), so another
// phone that still holds the delete lets it go — never taken for an older app's cut
const _untombedAt = {};
// A revival is written down as later than the delete it revives, whatever this phone's clock says
// (round 4): the delete's time comes from the phone that deleted, and a phone whose clock is behind
// wrote a revival "before" the delete — the deleting phone then kept its delete and erased the record again.
function reviveTime(key, id){
  const held = m => (m[key] && m[key].get(id) || {}).at || 0;
  return Math.max(Date.now(), (+((tombsDoc[key] || {})[id]) || 0) + 1, (+((_tombsLocalAt[key] || {})[id]) || 0) + 1, held(_tombsHeld) + 1, held(_tombsPending) + 1);
}
function forgetTombHere(key, id){
  // written down only for a record that was deleted (a whole-day restore revives every id it holds)
  if((_tombstones[key] && _tombstones[key].has(id)) || (tombsDoc[key] && tombsDoc[key][id] != null)) (_untombedAt[key] = _untombedAt[key] || {})[id] = reviveTime(key, id);
  if(_tombsLocalAt[key]) delete _tombsLocalAt[key][id];
  [_tombsHeld, _tombsPending, _tombsAgain].forEach(m => { if(m[key]) m[key].delete(id); });
}
// Bulk revival (a backup restore): clear whole batches from every delete layer
// with ONE shared-log write instead of one per record.
async function untombMany(sets){
  Object.keys(sets).forEach(k=>{
    if(!_tombstones[k]) return;
    const ids = (sets[k]||[]).filter(id=>id!=null);
    ids.forEach(id=>{
      forgetTombHere(k, id);
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
  return await persistTombs(); // whether the log took the revivals (a restore stops when it did not)
}
// The deletes a bulk revival is about to clear, so a restore that stops half-way
// can put them back (retombMany, round 3): { key: { id: { at, own } } }. A held
// delete (not in the log: reconcileTombs) is not one of them — once let go it
// stays let go (in doubt, the record stays).
function tombsOf(sets){
  const out = {};
  Object.keys(sets).forEach(k => {
    if(!_tombstones[k]) return;
    (sets[k] || []).forEach(id => {
      if(id == null || !_tombstones[k].has(id)) return;
      if((_tombsHeld[k] && _tombsHeld[k].has(id)) || (_tombsPending[k] && _tombsPending[k].has(id))) return;
      const own = (_tombsLocalAt[k] || {})[id];
      (out[k] = out[k] || {})[id] = { at: Math.max((tombsDoc[k] || {})[id] || 0, own || 0) || Date.now(), own: own != null ? own : null };
    });
  });
  return out;
}
// Those deletes back, everywhere (the revival undone), with ONE write of the log.
async function retombMany(prev){
  const now = Date.now();
  let raw = null; try{ raw = JSON.parse(localStorage.getItem('um_tombs') || '{}'); }catch(e){ raw = null; }
  Object.keys(prev || {}).forEach(k => Object.keys(prev[k]).forEach(id => {
    if(_untombed[k]) _untombed[k].delete(id);
    if(_untombedAt[k]) delete _untombedAt[k][id];
    _tombstones[k].add(id);
    (_tombsUnpublished[k] = _tombsUnpublished[k] || new Set()).add(id);
    (tombsDoc[k] = tombsDoc[k] || {})[id] = now; // newer than the revival just written: the log drops that
    if(prev[k][id].own != null){ (_tombsLocalAt[k] = _tombsLocalAt[k] || {})[id] = prev[k][id].own; if(raw) (raw[k] = raw[k] || {})[id] = prev[k][id].own; }
  }));
  if(raw){ try{ localStorage.setItem('um_tombs', JSON.stringify(raw)); }catch(e){} }
  return await persistTombs();
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
// The shared delete log is itself a UNION document (max timestamp wins, 120-day
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
      const cutoff = Date.now() - TOMB_KEEP_MS;
      out = {};
      Object.keys(_tombstones).forEach(k=>{
        out[k] = {};
        [cloud[k]||{}, tombsDoc[k]||{}].forEach(src=>Object.keys(src).forEach(id=>{
          if(_untombed[k] && _untombed[k].has(id)) return; // revived — drop from the shared log
          if(k === 'doctors' || (src[id]||0) > cutoff) out[k][id] = Math.max(out[k][id]||0, src[id] || 0); // doctor removals are kept for good (v121)
        }));
      });
      // Revivals written down beside the deletes (v123 review), 120 days, unless
      // deleted again since; and which version wrote the log (an older one drops both).
      const revived = {}, cloudRv = cloud.revived && typeof cloud.revived === 'object' ? cloud.revived : {};
      Object.keys(_tombstones).forEach(k => {
        const m = {};
        [cloudRv[k] || {}, _untombedAt[k] || {}].forEach(src => Object.keys(src).forEach(id => { const t = +src[id] || 0; if(t > cutoff && !(out[k][id] >= t)) m[id] = Math.max(m[id] || 0, t); }));
        if(Object.keys(m).length) revived[k] = m;
      });
      // A held delete published again (round 3) is marked as such (again: id → the delete's own time),
      // so a record the list holds again is never deleted on the strength of it (reviveAgainTombs).
      // The mark goes with a newer delete of the same id (a person deleted it again).
      const again = {}, cloudAg = cloud.again && typeof cloud.again === 'object' ? cloud.again : {};
      Object.keys(_tombstones).forEach(k => {
        const m = {}, add = (id, t) => { t = +t || 0; if(t && out[k][id] === t) m[id] = t; };
        Object.keys(cloudAg[k] || {}).forEach(id => add(id, cloudAg[k][id]));
        if(_tombsPending[k]) _tombsPending[k].forEach((v, id) => add(id, v.at));
        if(Object.keys(m).length) again[k] = m;
      });
      return JSON.stringify(Object.assign({}, out, { revived, again, rev: APP_REV_NUM }));
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
    Object.keys(_tombsPending).forEach(k => [..._tombsPending[k].keys()].forEach(id => { if(pub[k] && pub[k][id] != null) _tombsPending[k].delete(id); }));
    syncAgainTombs(pub);
    saveUnpubTombs();
    if(outboxHas('tombs')) outboxRemove('tombs');
    return true;
  }catch(e){
    saveUnpubTombs();
    // Never dropped, whatever the cloud said (v123 review): the deletes stay on
    // this phone and in the queue. Refused for a phone that still has access:
    // the rules' "no" — said, and the round sends it again only now and then
    // (parked); with no access (signed out, a sign-in that ended) it waits for
    // the next sign-in; when the cloud did not say which, the round tries again.
    outboxAdd('tombs');
    if(saveErrKind(e) === 'refused'){
      const acc = await accessCheck();
      if(acc === 'lost') parkSave('tombs', 'noAccess');
      else if(acc === 'ok') saveBlocked('tombs', 'refused', e);
    }
    return false;
  }
}
// The shared log is the team's truth about deletes. An id THIS device
// tombstoned that is no longer in the log was brought back from the recycle
// bin on another device (or has expired): the local tombstone must go too, or
// this device's next save would silently delete the restored record again —
// and its next persistTombs would even re-publish the delete to everyone.
// Our own deletes that the log has not confirmed yet, and anything younger
// than a minute (a read may predate an in-flight write), are left alone.
//
// v123 review: an older app version (v122) still rewrites the log with its
// 7-day cutoff, so a delete older than that can be missing although nobody
// brought the record back. Such a delete is kept (HELD) — unless the log says
// it was brought back (revived).
// Round 3 — a held delete deletes nothing by itself:
//  - it is never published from here, nor queued (until round 3 it went out
//    with this phone's next write of the log: the old deletes of records the
//    team had brought back on the older app deleted them again, everywhere);
//  - it goes back to the log only once this session has read the list itself
//    FROM THE CLOUD (never the phone's copy, never a read that failed) and
//    found the record absent — at the first refresh that shows it after the
//    hold has stood HELD_SETTLE_MS, not at this phone's next delete: a phone
//    with an old copy that uploads later is then held back by the log;
//  - when a list from the cloud holds the record, the hold is let go: a record
//    that exists is never deleted on the strength of a held delete (in doubt,
//    the record stays). That stays true after it was published again: the log
//    marks such a delete (again), and a record the cloud's list holds under a
//    marked delete is let go and written down as brought back (revived).
// Why it waits HELD_SETTLE_MS: an older app brings a record back by writing the
// log first (the delete goes) and the list after (the record returns). A v123
// phone that reads between the two sees "not in the log, not in the list" —
// published again at once, the delete removed the record the moment its list
// landed (proved with the real v122: a recycle-bin restore on a slow link).
// Until a held delete is settled it stays off this phone's screen and out of
// what this phone uploads (its own old copy never puts the record back).
// The wait counts across reopenings of the app: when each of this phone's own
// held deletes was first found missing is kept on the phone (um_tombsHeldAt) —
// a phone opened a minute at a time would otherwise never publish one.
let HELD_SETTLE_MS = 5 * 60000;
const HELD_AT = 'um_tombsHeldAt';
function heldSinceOnPhone(){ try{ const o = JSON.parse(localStorage.getItem(HELD_AT) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }catch(e){ return {}; } }
function saveHeldSince(){
  try{
    const o = {};
    Object.keys(_tombsHeld).forEach(k => _tombsHeld[k].forEach((v, id) => { (o[k] = o[k] || {})[id] = v.since; }));
    if(Object.keys(o).length) localStorage.setItem(HELD_AT, JSON.stringify(o)); else if(localStorage.getItem(HELD_AT) != null) localStorage.removeItem(HELD_AT);
  }catch(e){}
}
const _tombsHeld = {};    // key → Map id → { at: when it was deleted, since: when this phone first found it missing from the log } — kept here, NOT published
const _tombsPending = {}; // key → Map id → { at, since }: held, found absent by a read of the list, on its way to the log
const _tombsAgain = {};   // key → Map id → at: deletes the log marks as published again (this phone's or another's)
function reconcileTombs(cloudDoc){
  const doc = cloudDoc || {};
  const now = Date.now(), fresh = now - 60000, oldCut = now - OLD_TOMB_CUT_MS, keepFrom = now - TOMB_KEEP_MS;
  const revivedAll = doc.revived && typeof doc.revived === 'object' ? doc.revived : {};
  let raw = null, sinceOnPhone = null;
  // a hold that began before the app was last closed keeps its start — if that start fits this delete (a hold begins once the delete is older than 7 days)
  const sinceOf = (k, id, at) => { sinceOnPhone = sinceOnPhone || heldSinceOnPhone(); const t = +((sinceOnPhone[k] || {})[id]) || 0; return t >= at + OLD_TOMB_CUT_MS && t <= now ? t : now; };
  const forget = (k, id) => {
    _tombstones[k].delete(id);
    if(tombsDoc[k]) delete tombsDoc[k][id];
    if(_tombsLocalAt[k]) delete _tombsLocalAt[k][id];
    [_tombsHeld, _tombsPending, _tombsAgain].forEach(m => { if(m[k]) m[k].delete(id); });
    try{ raw = raw || JSON.parse(localStorage.getItem('um_tombs')||'{}'); if(raw[k]) delete raw[k][id]; }catch(e){}
  };
  Object.keys(_tombstones).forEach(k=>{
    const inCloud = doc[k] || {}, revived = revivedAll[k] || {};
    const unpub = _tombsUnpublished[k] || new Set();
    const pend = _tombsPending[k];
    [..._tombstones[k]].forEach(id=>{
      if(inCloud[id] != null){ if(_tombsHeld[k]) _tombsHeld[k].delete(id); return; } // in the log (again): an ordinary delete
      if(unpub.has(id)){
        // a held delete on its way back to the log that someone brought back meanwhile (the log says so): let go
        if(pend && pend.has(id) && revived[id] != null && +revived[id] >= pend.get(id).at){ unpub.delete(id); forget(k, id); }
        return;
      }
      // a read may predate a write still on its way — unless the log writes down a revival made
      // since this delete (round 4: a day's plan emptied and planned again within the minute)
      if(((tombsDoc[k]||{})[id] || 0) > fresh && !(revived[id] != null && +revived[id] >= ((tombsDoc[k]||{})[id] || 0))) return;
      const was = _tombsHeld[k] ? _tombsHeld[k].get(id) : null;
      const at = Math.max((tombsDoc[k]||{})[id] || 0, (_tombsLocalAt[k]||{})[id] || 0, was ? was.at : 0); // how old the delete is
      if(k !== 'doctors' && revived[id] == null && at && at < oldCut && at > keepFrom){
        (_tombsHeld[k] = _tombsHeld[k] || new Map()).set(id, { at, since: was ? was.since : sinceOf(k, id, at) });
        if(tombsDoc[k]) delete tombsDoc[k][id]; // out of what this phone writes to the log until a read of the list confirms it
        if(_tombsAgain[k]) _tombsAgain[k].delete(id); // (its mark went with it)
        return;
      }
      forget(k, id);
    });
  });
  if(raw){ try{ localStorage.setItem('um_tombs', JSON.stringify(raw)); }catch(e){} }
  saveHeldSince();
  saveUnpubTombs();
}
// The deletes the log marks as published again (again), as this read of the log has them.
function syncAgainTombs(doc){
  const ag = doc && doc.again && typeof doc.again === 'object' ? doc.again : {};
  Object.keys(_tombstones).forEach(k => {
    const next = new Map();
    Object.keys(ag[k] || {}).forEach(id => { const t = +ag[k][id] || 0; if(t && ((doc || {})[k] || {})[id] === t && _tombstones[k].has(id)) next.set(id, t); });
    if(next.size) _tombsAgain[k] = next; else delete _tombsAgain[k];
  });
}
// Forgotten on this phone, nothing written to the log (it does not have them).
function dropTombsHere(key, ids){
  let raw = null;
  ids.forEach(id => {
    if(_tombstones[key]) _tombstones[key].delete(id);
    if(_tombsUnpublished[key]) _tombsUnpublished[key].delete(id);
    if(tombsDoc[key]) delete tombsDoc[key][id];
    if(_tombsLocalAt[key]) delete _tombsLocalAt[key][id];
    [_tombsHeld, _tombsPending, _tombsAgain].forEach(m => { if(m[key]) m[key].delete(id); });
    try{ raw = raw || JSON.parse(localStorage.getItem('um_tombs') || '{}'); if(raw[key]) delete raw[key][id]; }catch(e){}
  });
  if(raw){ try{ localStorage.setItem('um_tombs', JSON.stringify(raw)); }catch(e){} }
  saveHeldSince();
}
// A delete held above whose record the list holds again (brought back on an
// older app version): let go — the record stays, on every phone (v123 review).
function releaseHeldTombs(key, ids){
  const h = _tombsHeld[key];
  if(!h || !h.size || !ids) return;
  dropTombsHere(key, ids.filter(id => h.has(id)));
}
// A delete published again after an older app's cut (marked in the log, or this
// phone's own on its way) whose record a list FROM THE CLOUD holds (round 3):
// the record exists — let go here and written down as brought back (revived),
// so every phone lets it go and the log drops the delete. → how many
function reviveAgainTombs(key, has){
  const ids = [];
  [_tombsAgain[key], _tombsPending[key]].forEach(m => { if(m) m.forEach((v, id) => { if(has(id) && !ids.includes(id)) ids.push(id); }); });
  if(!ids.length) return 0;
  const now = Date.now();
  ids.forEach(id => {
    (_untombedAt[key] = _untombedAt[key] || {})[id] = now;
    (_untombed[key] = _untombed[key] || new Set()).add(id);
  });
  dropTombsHere(key, ids);
  console.warn(`delete log: ${ids.length} ${key} record(s) the list holds again under a delete published again — kept, written down as brought back`);
  return ids.length;
}
// What a read of the list FROM THE CLOUD says about the deletes held (round 3):
// a record the list holds → let go (it exists: it stays); one it does not hold,
// held for HELD_SETTLE_MS before this read began (`settled`: those ids) →
// confirmed: back to the log at once (publishConfirmedTombs). `has(id)`: the
// list holds it. → how many were confirmed.
function settleHeldTombs(key, has, settled){
  const h = _tombsHeld[key];
  if(!h || !h.size) return 0;
  const present = [], confirm = [];
  h.forEach((v, id) => { if(has(id)) present.push(id); else if(settled && settled.has(id)) confirm.push([id, v]); });
  if(present.length) releaseHeldTombs(key, present);
  confirm.forEach(([id, v]) => {
    h.delete(id);
    (_tombsPending[key] = _tombsPending[key] || new Map()).set(id, v);
    (_tombsUnpublished[key] = _tombsUnpublished[key] || new Set()).add(id);
    (tombsDoc[key] = tombsDoc[key] || {})[id] = v.at;
    _tombstones[key].add(id);
  });
  if(confirm.length) saveHeldSince();
  return confirm.length;
}
// The deletes held long enough, as the reads of a refresh begin: key → Set of ids.
// No delete of a visit held, on its way to the log or marked as published again: a kept month may stand in for its read (v126)
function visitsTombsQuiet(){ return ![_tombsHeld, _tombsPending, _tombsAgain].some(o => o.visits && o.visits.size); }
function heldSettledNow(){
  const o = {}, now = Date.now();
  Object.keys(_tombsHeld).forEach(k => { const s = new Set(); _tombsHeld[k].forEach((v, id) => { if(now - v.since >= HELD_SETTLE_MS) s.add(id); }); if(s.size) o[k] = s; });
  return o;
}
// The confirmed deletes (and the revivals a refresh wrote down) go to the log
// now. A confirmed delete that does not land (no connection, refused) goes
// back to held — never left in the queue as a delete to publish: only the next
// read of the list that confirms it again sends it (round 3).
async function publishConfirmedTombs(){
  const ok = await persistTombs();
  Object.keys(_tombsPending).forEach(k => {
    const p = _tombsPending[k];
    [...p.keys()].forEach(id => {
      if(!(_tombsUnpublished[k] && _tombsUnpublished[k].has(id))){ p.delete(id); return; } // it landed (this write or another)
      if(ok) return;
      const v = p.get(id); p.delete(id);
      _tombsUnpublished[k].delete(id);
      if(tombsDoc[k]) delete tombsDoc[k][id];
      if(_tombstones[k] && _tombstones[k].has(id)) (_tombsHeld[k] = _tombsHeld[k] || new Map()).set(id, v);
    });
  });
  if(!ok) saveHeldSince();
  return ok;
}
const idsOfList = list => new Set((Array.isArray(list) ? list : []).map(x => x && x.id).filter(id => id != null));
const planKeysOf = plans => new Set((plans && typeof plans === 'object') ? Object.keys(plans).flatMap(d => Object.keys(plans[d] || {}).map(r => d + '|' + r)) : []);
const heldIdsIn = (key, list) => (_tombsHeld[key] && _tombsHeld[key].size && Array.isArray(list)) ? list.filter(x => x && x.id != null && _tombsHeld[key].has(x.id)).map(x => x.id) : null;
const heldPlanKeysIn = plans => (_tombsHeld.dayPlans && _tombsHeld.dayPlans.size && plans && typeof plans === 'object') ? [...planKeysOf(plans)].filter(k => _tombsHeld.dayPlans.has(k)) : null;
// In a merge with the cloud's list (inside its transaction): what that list
// holds is never deleted by a held delete, nor by one published again. The
// revival goes to the log right after (never from inside the transaction).
let _tombsOwed = 0;
function keepWhatCloudHolds(key, cloud){
  const ids = key === 'dayPlans' ? planKeysOf(cloud) : idsOfList(cloud);
  if(key === 'dayPlans') releaseHeldTombs('dayPlans', heldPlanKeysIn(cloud)); else releaseHeldTombs(key, heldIdsIn(key, cloud));
  if(reviveAgainTombs(key, id => ids.has(id)) && !_tombsOwed){ _tombsOwed = setTimeout(() => { _tombsOwed = 0; persistTombs(); }, 0); }
}
// Read-only pull of the team's delete log — MUST run before flushing queued
// offline edits, or another device's delete could be resurrected by our flush.
// → 'ok' (the cloud answered), 'refused' (this login has no access: said once,
// noteNoAccess) or 'failed' (no connection) — the queue's flush reads it (v123 review).
async function refreshTombs(run){
  try{
    const cur = await withTimeout(pfTake(run, 'tombs') || window.storage.get('tombs', true), 5000);
    const doc = cur ? (UMCore.safeParse(cur.value, null) || {}) : {};
    absorbTombs(doc);
    reconcileTombs(doc);
    syncAgainTombs(doc);
    return 'ok';
  }catch(e){ return noteNoAccess('tombs', e) ? 'refused' : 'failed'; }
}
// A doctor removed from a clinic (tombstone 'clinicId|doctorId') must not
// come back from a stale copy of the clinic — at load or in a merge.
function dropTombedDoctors(c, view){
  const dt = view instanceof Set ? view : _tombstones.doctors; // (view: the early open's — never a .map index)
  if(!c || !dt || !dt.size || !Array.isArray(c.doctors)) return c;
  c.doctors = c.doctors.filter(d => !(d && dt.has(c.id + '|' + d.id)));
  return c;
}
let _flushing = false;
let _refreshFlush = null; // the upload a refresh ends with (loadAllNow): the 20-second round is over only once it is done (round 3)
let _bootLoaded = false;   // flush only with real, loaded state — never factory globals
let _lastOfflineToast = 0;
function offlineToast(msg){
  const now = Date.now();
  if(now - _lastOfflineToast < 60000) return; // once a minute, not per save
  _lastOfflineToast = now;
  showToast(msg);
}
async function flushOutbox(){
  if(earlyUnconfirmed()) return; // the early open: nothing goes to the cloud before the sign-in is confirmed (v126 speed, part 3)
  if(_bootLoaded && currentUser && typeof photoReadKeptQuiet === 'function') photoReadKeptQuiet(); // the phone's own photo stores need no signal (12-reports.js)
  if(_flushing || !navigator.onLine || !_bootLoaded || !currentUser) return;
  if(typeof retryPhotos === 'function') retryPhotos(); // photos kept on this phone until the cloud holds them (12-reports.js) — in the background, even with nothing queued
  dropQueuedErpMap(); // never replayed (see dropQueuedErpMap)
  // A list the rules refused is sent again now and then (round 3: about hourly),
  // as well as at a sign-in and on the bar's "Try again".
  let due = 0;
  [..._saveParked.entries()].forEach(([k, why]) => { if(why === 'refused' && Date.now() - (_parkedAt.get(k) || 0) >= PARK_RETRY_MS){ _saveParked.delete(k); _parkedAt.delete(k); due++; } });
  if(due){ renderTooLargeBar(); updateSyncBadge(); }
  const pending = outboxList();
  // nothing the round may send (too large for the cloud, refused by the rules): nothing to do here,
  // and the refresh goes on for every other list (bgRefresh, round 3)
  if(!pending.some(k => !_saveBlocked.has(k) && _saveParked.get(k) !== 'refused')) return;
  _flushing = true;
  let allOk = true;
  const memOnly0 = _memOnly.size; // its own "Saved" toast says it when such a save lands
  const who = currentUser;
  try{
    const tr = await refreshTombs(); // learn the team's deletes before pushing our queue
    // The cloud answers this login again: what waited for access goes now.
    // It refuses this login everything (signed out, a sign-in that ended):
    // nothing is sent, all of it stays on this phone and in the queue (v123 review).
    if(tr === 'ok') unparkSaves('noAccess');
    else if(tr === 'refused'){ pending.forEach(k => { if(!_saveParked.has(k)) parkSave(k, 'noAccess'); }); allOk = false; return; }
    for(const key of pending){
      // signed out (or someone else signed in) while this ran: the rest waits on this phone for the next round
      if(currentUser !== who){ allOk = false; break; }
      // a list too large for the cloud stays kept on this phone, but the round
      // does not send it again by itself (v123): a tap does (saveBlocked); so
      // does a list the cloud refused (parked, kept on this phone: v123 review)
      if(_saveBlocked.has(key) || _saveParked.has(key)){ allOk = false; continue; }
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
  const n = outboxList().filter(k => !_saveBlocked.has(k) && !_saveParked.has(k)).length; // a list too large for the cloud, or one the cloud refused, is not uploading: the red bar says so (v123)
  // nothing uploads before the early open's sign-in is confirmed: its line says what the screen is (v126 speed, part 3)
  const show = (!navigator.onLine || (n > 0 && !earlyUnconfirmed())) && !_memOnly.size; // the red bar (renderMemOnlyBar) says it all on a full phone
  document.body.classList.toggle('um-syncpill', !!show);
  if(!show){ if(el) el.style.display='none'; return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'syncPill';
    el.className = 'sbar sbar-pill sbar-warn';
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
// Visits (v123) merge the same way against the document's own base; a base
// value that is a fingerprint (kept on the phone while the visits waited in
// the queue) takes the cloud's whole visit when this phone did not change it.
// `patches` (visits): filled with what the merge took from the cloud for each
// visit on screen, so the caller puts it on screen once the write has landed.
function mergeById(key, local, cloud, base, patches){
  if(!Array.isArray(cloud)) return { merged: local, recovered: 0 };
  keepWhatCloudHolds(key, cloud); // brought back elsewhere on an older app: kept, never deleted again (v123 review; round 3: also under a delete published again)
  const ts = _tombstones[key] || new Set();
  if(base && key === 'clinics') cloud = normalizeClinics(cloud); // compared with the base, which is normalized the same way
  // Deleted ids are dropped from BOTH sides: our own deletes never come back
  // from the cloud, and a stale local copy never resurrects them either.
  const localKept = (local || []).filter(x => !(x && ts.has(x.id)));
  const have = new Set(localKept.map(x => x && x.id));
  let recovered = 0;
  const cloudById = {};
  cloud.forEach(x => { if(x && x.id != null) cloudById[x.id] = x; });
  const fieldMerge = key === 'clinics' ? { doctors: (L, C, B) => UMCore.mergeDoctorLists3(L, C, B).doctors } // by id: two records of one name both stay (v123)
    : (key === 'visits' && typeof UMCore.mergePhotos3 === 'function') ? { photos: (L, C, B) => UMCore.mergePhotos3(L, C, B) } : null;
  const merged = localKept.map(x => {
    const bx = base && x && x.id != null ? base.get(x.id) : null;
    const cx = x && x.id != null ? cloudById[x.id] : null;
    if(bx == null || !cx) return x;
    if(typeof bx === 'string'){ // a fingerprint (visits): unchanged here since the cloud confirmed it → the cloud's visit
      if(typeof UMCore.recordHash !== 'function' || UMCore.recordHash(x) !== bx || JSON.stringify(cx) === JSON.stringify(x)) return x;
      recovered++;
      return cx;
    }
    if(typeof UMCore.merge3Record !== 'function') return x; // (an old cached core.js: as before)
    const r = UMCore.merge3Record(x, cx, bx, fieldMerge);
    if(r.fromCloud) recovered++;
    // a doctor the team removed never comes back from the cloud's side of the
    // three-way merge (a stale copy, or a phone still on an older version)
    return key === 'clinics' ? dropTombedDoctors(r.value) : r.value;
  });
  // A photo the cloud already holds stays uploaded (v122): a phone whose copy
  // of the visit still says "waiting to upload" never puts that mark back.
  if(key === 'visits' && typeof UMCore.settlePhotoMarks === 'function') merged.forEach(x => { if(x && cloudById[x.id]) UMCore.settlePhotoMarks(x, cloudById[x.id]); });
  // What the merge took from the cloud for each visit on screen, field by field
  // with the value the screen had (an edit made while the write is on its way
  // is never overwritten when the caller applies it).
  if(patches) merged.forEach((m, i) => {
    const x = localKept[i];
    if(m === x || !x || typeof x !== 'object') return;
    const fields = [], ks = new Set(Object.keys(x).concat(Object.keys(m)));
    ks.forEach(k => { const a = JSON.stringify(x[k] === undefined ? null : x[k]); if(a !== JSON.stringify(m[k] === undefined ? null : m[k])) fields.push([k, a, m[k]]); });
    if(fields.length) patches.push({ obj: x, fields });
  });
  cloud.forEach(x => {
    if(x && x.id != null && !have.has(x.id) && !ts.has(x.id)){ merged.push(x); recovered++; }
  });
  // A clinic's doctors are a shared list: a doctor added on another device
  // is kept (union by id) instead of being overwritten by this device's older
  // copy of the clinic. Two records of one name both stay (v123: the
  // supervisor merges them by tap — never this union).
  if(key === 'clinics') merged.forEach(x => {
    const cx = x && cloudById[x.id];
    if(!cx || !Array.isArray(cx.doctors) || !cx.doctors.length) return;
    const before = (x.doctors || []).length;
    const dt = _tombstones.doctors || new Set();
    const m = (typeof UMCore.unionDoctorsById === 'function' ? UMCore.unionDoctorsById : UMCore.mergeDoctorLists)(x.doctors || [], cx.doctors.filter(d => d && !dt.has(x.id + '|' + d.id)));
    x.doctors = m.doctors;
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
// Day plans and visits keep their base on the phone too while queued (v123):
// day plans as the text of _dpBase; visits as id → fingerprint of each visit as
// the cloud last confirmed it (UMCore.recordHash — the full copy would double
// what the visits take on the phone), from the documents this phone read or
// wrote, else the fingerprints it kept or took from its copy at start.
function setMergeBase(key, str){
  if(!BASE_KEYS[key]) return;
  if(typeof str === 'string' && _mergeBaseStr[key] === str && _mergeBase[key]) return; // that very text already (v126 speed; the base is never edited: parsed apart from the screen)
  const arr = typeof str === 'string' ? UMCore.safeParse(str, null) : null;
  if(!Array.isArray(arr)){ delete _mergeBase[key]; delete _mergeBaseStr[key]; return; }
  const list = key === 'clinics' ? normalizeClinics(arr) : arr;
  _mergeBase[key] = new Map(list.filter(x => x && x.id != null).map(x => [x.id, x]));
  _mergeBaseStr[key] = str;
}
function mergeBaseFor(key){ return (BASE_KEYS[key] && _mergeBase[key]) || null; }
function keepMergeBaseOnPhone(key){
  let str = null;
  if(BASE_KEYS[key]) str = _mergeBaseStr[key];
  else if(key === 'dayPlans') str = _dpBase;
  else if(key === 'visits'){
    const m = visitsBaseFingerprints();
    str = m && m.size ? JSON.stringify(Object.fromEntries(m)) : null;
    // beside the fingerprints, the whole base record of each visit this phone
    // changed (only those: a copy of every visit would double what the visits
    // take on the phone) — a reopen then still merges it field by field
    const recs = m && m.size ? visitsChangedBases(m) : {};
    try{ if(Object.keys(recs).length) localStorage.setItem('um_base:visitsRec', JSON.stringify(recs)); else localStorage.removeItem('um_base:visitsRec'); }catch(e){}
  }
  if(str != null){ try{ localStorage.setItem('um_base:' + key, str); }catch(e){} }
}
// id → the base record (as the cloud last confirmed it) of every visit on
// screen whose fingerprint differs from it: kept from earlier, else from the
// documents this session read, else from the phone's copy (before this save
// replaces it: a visit it had not changed then is still its base).
function visitsChangedBases(fps){
  const out = {}, today = todayStr();
  const dirty = _visitsDirtyDocs; _visitsDirtyDocs = null; // (unknown → every document: a few ms more, never a visit missed)
  let docs = null, copy = null;
  const index = (map, str) => { const a = typeof str === 'string' ? UMCore.safeParse(str, null) : null; if(Array.isArray(a)) a.forEach(v => { if(v && v.id != null && !map.has(v.id)) map.set(v.id, v); }); };
  const fromDocs = id => { if(!docs){ docs = new Map(); index(docs, _visitsLoaded); Object.keys(_visitsArch).forEach(mo => index(docs, _visitsArch[mo].json)); } return docs.get(id); };
  const fromCopy = id => { if(!copy){ copy = new Map(); index(copy, mirrorGet('visits')); } return copy.get(id); };
  (visits || []).forEach(v => {
    if(!v || v.id == null) return;
    const fp = fps.get(v.id);
    if(typeof fp !== 'string') return; // new here: no base
    const kept = _visitsBaseRecs && _visitsBaseRecs.get(v.id);
    if(kept && UMCore.recordHash(kept) === fp){ out[v.id] = kept; return; } // changed before: its base is kept already
    if(dirty && !dirty.has(UMCore.visitHome(v, today))) return; // its document is as the cloud last confirmed it
    if(UMCore.recordHash(v) === fp) return; // unchanged: the fingerprint says it all
    for(const get of [fromDocs, fromCopy]){
      const b = get(v.id);
      if(b && typeof b === 'object' && UMCore.recordHash(b) === fp){ out[v.id] = b; return; }
    }
  });
  return out;
}
function dropMergeBaseOnPhone(key){
  if(BASE_KEYS[key] || key === 'dayPlans' || key === 'visits'){ try{ localStorage.removeItem('um_base:' + key); if(key === 'visits') localStorage.removeItem('um_base:visitsRec'); }catch(e){} }
}
function mergeBaseFromPhone(key){
  if(key === 'dayPlans' && _dpBase != null) return;
  if(key === 'visits' && (_visitsBaseHash || _visitsLoaded != null)) return;
  if(BASE_KEYS[key] && _mergeBase[key]) return;
  if(!BASE_KEYS[key] && key !== 'dayPlans' && key !== 'visits') return;
  let s = null; try{ s = localStorage.getItem('um_base:' + key); }catch(e){}
  if(s == null) return;
  if(key === 'dayPlans'){ if(UMCore.safeParse(s, null)) _dpBase = s; return; }
  if(key === 'visits'){ // the fingerprints kept beside a queued or unfinished save come first
    const o = UMCore.safeParse(s, null);
    if(o && typeof o === 'object' && !Array.isArray(o)){
      _visitsBaseHash = new Map(Object.entries(o).filter(([, h]) => typeof h === 'string')); _visitsBaseText = null; _visitsBaseParsed = null;
      let r = null; try{ r = UMCore.safeParse(localStorage.getItem('um_base:visitsRec'), null); }catch(e){}
      _visitsBaseRecs = r && typeof r === 'object' && !Array.isArray(r) ? new Map(Object.entries(r).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))) : null;
    }
    return;
  }
  setMergeBase(key, s);
}
// id → fingerprint of every visit the cloud last confirmed to this phone: the
// documents read or written this session, else the fingerprints kept earlier.
// Each document's fingerprints are kept while its text is the same, so only a
// month that changed is read again (a queue of offline saves asks at every save).
const _vbhDoc = {};
function visitsBaseFingerprints(){
  const fb = visitsFallbackBase(), map = new Map();
  if(fb) fb.forEach((v, id) => map.set(id, typeof v === 'string' ? v : UMCore.recordHash(v)));
  const docs = { live: _visitsLoaded };
  Object.keys(_visitsArch).forEach(m => { docs[m] = _visitsArch[m].json; });
  Object.keys(docs).forEach(d => {
    const str = docs[d];
    if(typeof str !== 'string') return;
    let memo = _vbhDoc[d];
    if(!memo || memo.str !== str){
      const arr = UMCore.safeParse(str, null);
      memo = _vbhDoc[d] = { str, pairs: Array.isArray(arr) ? arr.filter(v => v && v.id != null).map(v => [v.id, UMCore.recordHash(v)]) : [] };
    }
    memo.pairs.forEach(([id, h]) => map.set(id, h));
  });
  return map;
}
// The base of a whole document's compare-and-set, kept beside the phone's copy
// when that copy holds an edit the cloud has not confirmed (a save that did not
// land, or a refresh that ran while it was on its way): a start without a
// connection then still compares with what the cloud last held, instead of
// calling this phone's own edit "changed on another device" (v123).
function keepDocBaseOnPhone(key, shown){
  const b = _docLoaded[key];
  try{
    if(b === undefined || shown === b) localStorage.removeItem('um_docbase:' + key);
    else localStorage.setItem('um_docbase:' + key, JSON.stringify({ v: b }));
  }catch(e){}
}
function dropDocBaseOnPhone(key){ try{ localStorage.removeItem('um_docbase:' + key); }catch(e){} }
function docBaseFromPhone(key){
  let o = null; try{ o = UMCore.safeParse(localStorage.getItem('um_docbase:' + key), null); }catch(e){}
  return o && typeof o === 'object' && 'v' in o && (o.v === null || typeof o.v === 'string') ? o.v : undefined;
}
// Day plans merge three ways: the lists this device changed since it last
// loaded/saved (_dpBase) win, every other date|rep list takes the cloud's —
// so a clinic removed from a plan on another device stays removed.
let _dpBase = null;
// A day's plan emptied here or elsewhere (date|rep in the delete log) and planned again — moved
// back, planned again for that date, a follow-up on that day, "Add to today's plan", the
// supervisor planning it, a rename back: every plan save passes here. The delete stayed in the
// log, and the next plan save on ANY phone whose copy of that day had not changed erased the day
// from the cloud and from every screen (round 4). Now the delete leaves the log (untomb: written
// down as brought back, so a phone that still holds it lets it go) BEFORE the plan is written.
// Only a day THIS phone changed since its base: a stale copy never brings a deleted day back.
async function revivePlannedDays(local, baseStr){
  const t = _tombstones.dayPlans, owed = outboxHas('tombs'); // a revival still waiting in the queue goes before the plan too
  const base = baseStr ? UMCore.safeParse(baseStr, null) : null;
  if(!t || !t.size || !local || typeof local !== 'object' || !base || typeof base !== 'object'){ if(owed) await persistTombs(); return; } // (no base: nothing tells what this phone changed)
  const keys = [];
  Object.keys(local).forEach(d => Object.keys(local[d] || {}).forEach(r => {
    const k = d + '|' + r, L = local[d][r], B = base[d] ? base[d][r] : undefined;
    if(t.has(k) && Array.isArray(L) && L.length && JSON.stringify(L) !== JSON.stringify(B === undefined ? null : B)) keys.push(k);
  }));
  if(!keys.length){ if(owed) await persistTombs(); return; }
  keys.forEach(k => untomb('dayPlans', k, true));
  await persistTombs(); // one write of the log; not landed → it waits in the queue, and is sent again before the plan
}
function mergeDayPlans(local, cloud, baseStr){
  keepWhatCloudHolds('dayPlans', cloud); // (as mergeById: a plan an older app brought back stays)
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
// A whole document saved by compare-and-set (the catalog, the targets, the team list, the KPI settings, the selling
// guides): one save of it at a time, each against what the one before it landed (v126 speed, part 4) — two saves of
// one document started together met in the cloud as "Changed on another device" (the second was refused, and its edit
// went at the next refresh). A save with none of its document on its way starts at once, as before.
// What this phone's saves of a document sent (wholeDocSent: text → the save's number): a text an earlier save sent —
// on its way, or landed late — is this phone's own, already in what memory holds, so the cloud holding it is a later
// save's base. Let go when a later save lands (the cloud moved past it), when a save ends without writing, and when a
// refresh takes the document anew (memory is then the cloud's text: the earlier texts are no longer in it).
const WHOLE_CAS = { products: 1, targets: 1, staff: 1, benchmarks: 1, categoryGuides: 1 };
const _wholeDocChain = Object.create(null), _wholeDocBusy = Object.create(null), _wholeDocSentBy = Object.create(null);
let _wholeDocSeq = 0;
function wholeDocSent(key){ return _wholeDocSentBy[key] || (_wholeDocSentBy[key] = new Map()); }
function wholeDocSentLanded(key, seq){ const m = _wholeDocSentBy[key]; if(m) m.forEach((n, t) => { if(n < seq) m.delete(t); }); }
function wholeDocSentForget(key){ const m = _wholeDocSentBy[key]; if(m) m.clear(); }
function persistNow(key, opts){
  if(!WHOLE_CAS[key]) return persistNowInner(key, opts);
  const run = () => persistNowInner(key, opts);
  const p = _wholeDocBusy[key] ? _wholeDocChain[key].then(run) : run();
  _wholeDocBusy[key] = (_wholeDocBusy[key] || 0) + 1;
  const tail = _wholeDocChain[key] = p.then(() => {}, () => {});
  tail.then(() => { _wholeDocBusy[key]--; });
  return p;
}
async function persistNowInner(key, opts){
  opts = opts || {};
  // What THIS call did — kept for persistOutcome, and told to its own caller
  // (opts.told, see persistFor / persistTold): another save of the same key
  // can start before that caller gets to read persistOutcome.
  const tell = info => { _persistInfo[key] = info; if(typeof opts.told === 'function'){ try{ opts.told(info); }catch(e){} } };
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
    tell({ ok: false, queued: false, mirrored: false, refused: true, quiet: true }); // its own words above say why
    return false;
  }
  if(key === 'erpSales'){ // split storage: index + row chunks; a failure keeps the red retry bar (never queued)
    const ok = await persistErpSales();
    tell(ok === true ? { ok: true } : Object.assign({ ok: false, queued: false, mirrored: false, erp: true }, _erpSaveFail || {}));
    return ok;
  }
  const map = {clinics, products, visits, tasks, dayPlans, events, targets, staff, recycleBin, benchmarks: BENCHMARKS, categoryGuides, erpSales, erpMap, erpNotes};
  // The recycle bin keeps 30 days: pruned on every write of it (v123), not
  // only when its screen opens — an old bin grew towards the cloud's size
  // limit, and past it every delete was refused.
  if(key === 'recycleBin' && typeof pruneBin === 'function') pruneBin();
  let value = key === 'clinics' ? storedClinics() : map[key]; // hoisted: the catch mirrors the MERGED copy, not the pre-merge one
  const base0 = mergeBaseFor(key); // the base this list was taken with: an overlapping save of the same list may move it meanwhile
  const dpBase0 = _dpBase;          // likewise for the day plans
  _persistInfo[key] = null;
  try{
    if(key === 'visits'){
      await persistVisits(opts); // live + archives + index; throws when the cloud is unreachable
      if(outboxHas('visits')) outboxRemove('visits');
      dropMergeBaseOnPhone('visits'); // the documents just written are the base now
      saveUnblocked('visits');
      tell({ ok: true });
      maybeSnapshot(); // only from a copy that is the cloud's (snapshotReadOk)
      return true;
    }
    if(MERGE_KEYS[key] || key === 'dayPlans'){
      if(key === 'dayPlans') await revivePlannedDays(value, dpBase0);
      // The team's delete log first, so a record another device deleted since
      // our load is dropped from the union instead of being resurrected.
      await refreshTombs();
      // Read → merge → write as ONE atomic step (a transaction where the
      // storage supports it): the merge sees the cloud copy as it is at commit
      // time, so two devices saving within the same second both keep their
      // additions. If the cloud is unreachable we never fall back to a blind
      // overwrite — the save queues in the offline outbox and uploads merged.
      const local = value;
      let refused = false, applied = null, big = 0;
      const mergeFn = cloudStr => {
        refused = false; big = 0; // a transaction may run more than once: each run starts clean
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
        const s = JSON.stringify(v);
        // A list the cloud cannot store (v123): nothing is written, and it is said — never queued.
        if(!UMCore.fitsBytes(s, DOC_MAX_BYTES)){ big = UMCore.utf8Len(s); return null; }
        return s;
      };
      const written = await storageUpdate(key, mergeFn, 12000);
      if(refused){
        showToast('🛑 مُنع حفظٌ كان سيحذف معظم العيادات — افتح النسخ الاحتياطية إذا كانت القائمة ناقصة');
        tell({ ok: false, queued: false, mirrored: false, refused: true, quiet: true }); // its own words above say why
        return false;
      }
      if(big) throw tooLargeError(key, null, big);
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
      saveUnblocked(key);
      tell({ ok: true });
      if(['clinics','visits','tasks'].includes(key)) maybeSnapshot(); // never stale or partial state (snapshotReadOk)
      return true;
    }
    // Whole documents (v123): ONE compare-and-set, in a transaction, against the
    // exact text the copy on screen came from (_docLoaded: read, written by this
    // phone, or the phone's own copy after a start without a connection). If
    // another phone saved in between, nothing is written: "Changed on another
    // device". A transaction needs the server, so a save the app gave up on can
    // no longer land minutes later over a newer one (the plain set could), and
    // the first save after a start from the phone's copy is no longer refused
    // when nothing changed. A copy that was never read (the read failed and the
    // phone holds none) expects no document at all. The recycle bin and the ERP
    // notes, which every phone writes, are merged three ways instead (an entry
    // added or removed on another phone is kept so). A document larger than the
    // cloud stores is never sent: said, never queued (saveBlocked).
    // The same holds for a save made while the screen still shows this phone's copy at a start (the early open's
    // window, v126 speed): the copy's text is the base, as after a start without a connection — never merged with
    // what another phone saved meanwhile (part 4: part 3 merged it, against the owner's rule of no automatic merges).
    // One save of a document at a time (wholeDocChain): a save started while an earlier one of the same document is
    // on its way runs after it, against what that one landed — this phone's second edit is never refused as another
    // device's change. The text of an earlier save of this phone whose answer did not come in time (it may still land:
    // wholeDocSent) is this phone's own: the cloud holding it is the base, never the other way round (an earlier
    // save never writes over a later one).
    const loaded = _loadFailed[key] ? undefined : _docLoaded[key];
    const merged3 = key === 'recycleBin' || key === 'erpNotes';
    const str = merged3 ? null : JSON.stringify(value);
    if(!merged3 && !UMCore.fitsBytes(str, DOC_MAX_BYTES)) throw tooLargeError(key, null, UMCore.utf8Len(str));
    const sent = merged3 ? null : wholeDocSent(key), seq = ++_wholeDocSeq;
    let conflict = false, big = 0;
    const fn = cur => {
      conflict = false; big = 0; // a transaction may run more than once: each run starts clean
      if(merged3){
        const c = cur != null ? UMCore.safeParse(cur, null) : null;
        const s = JSON.stringify(c && typeof c === 'object' ? mergeWholeDoc(key, key === 'recycleBin' ? recycleBin : erpNotes, c, loaded) : (key === 'recycleBin' ? recycleBin : erpNotes));
        if(!UMCore.fitsBytes(s, DOC_MAX_BYTES)){ big = UMCore.utf8Len(s); return null; }
        return s;
      }
      if(cur === str) return str; // already there (a run of the transaction whose answer was lost)
      const mine = typeof cur === 'string' && sent.has(cur) && sent.get(cur) < seq; // an earlier save of this phone landed it
      if(cur !== (loaded === undefined ? null : loaded) && !mine){ conflict = true; return null; }
      return str;
    };
    if(sent) sent.set(str, seq);
    const op = typeof window.storage.update === 'function' ? window.storage.update(key, fn) : storageUpdate(key, fn, 12000);
    if(sent) Promise.resolve(op).then(v => { if(v == null && sent.get(str) === seq) sent.delete(str); }, () => {}); // ended without writing: never in the cloud
    let written;
    try{ written = await withTimeout(op, 12000); }
    catch(e){
      // no answer in time: if the transaction does land after all, the phone follows it
      // (opts.onLate: what the screen still had to do once it landed — the rename's other lists, v123 review)
      if(/timeout/.test(String(e && e.message))) Promise.resolve(op).then(late => { if(late != null){ if(sent) wholeDocSentLanded(key, seq); wholeDocLanded(key, late, loaded, true); saveUnblocked(key); showToast('✅ Saved — it reached the cloud late', 5000); if(typeof opts.onLate === 'function'){ try{ opts.onLate(late); }catch(e2){ console.warn('after a late save', e2); } } } }, () => {});
      throw e; // → "No connection — retry" below (never queued)
    }
    if(conflict){
      if(!opts.quietConflict){
        const msg = loaded === undefined ? '⚠️ هذه البيانات لم تُحمَّل من السحابة بعد — أعد فتح التطبيق قبل الحفظ' : '⚠️ Changed on another device — reopen the app, then save again';
        showToast(msg, 6000);
        refusedSave(key, loaded === undefined ? REFUSED_NOT_READ : REFUSED_ELSEWHERE); // stays said, whatever the screen that saved says next
      }
      tell({ ok: false, queued: false, mirrored: false, refused: true, quiet: !opts.quietConflict }); // its own words above (and the bar) say why
      return false;
    }
    if(big) throw tooLargeError(key, null, big);
    if(written == null) throw new Error('update failed');
    if(sent) wholeDocSentLanded(key, seq);
    wholeDocLanded(key, written, loaded);
    if(outboxHas(key)) outboxRemove(key);
    saveUnblocked(key);
    tell({ ok: true });
    return true;
  }catch(e){
    // Refused by the security rules, or larger than the cloud can store: it
    // can never land as it is — said at once, never queued (v123). A refusal
    // on a phone that has lost its access to the team's data (signed out, a
    // sign-in that ended) is not the rules' "no": kept and queued below, like a
    // save with no connection, and sent once access is back (v123 review).
    const kind = saveErrKind(e);
    const acc = kind === 'refused' ? await accessCheck() : null;
    const lost = acc === 'lost', unsure = acc === 'unknown'; // unsure (round 3): kept and queued like an offline save, tried again by the round
    if(kind && !lost && !unsure){
      // a list already waiting in the queue keeps this change with the others on the phone (round 3: "kept on this phone" is then true of it too)
      if(kind === 'refused' && (MERGE_KEYS[key] || key === 'dayPlans') && outboxHas(key)){
        const v = (typeof value !== 'undefined' && value !== null) ? value : map[key];
        keepMergeBaseOnPhone(key);
        if(!mirrorSave(key, JSON.stringify(v))){ _memOnly.add(key); renderMemOnlyBar(); } // the phone is full: only in memory, said by the red bar
      }
      tell(saveBlocked(key, kind, e)); return false;
    }
    // Cloud unreachable. Merge-safe lists queue for an automatic, union-based
    // upload; whole-document supervisor files do NOT (a delayed overwrite
    // could erase a newer cloud version) — those ask for a manual retry.
    const queueable = MERGE_KEYS[key] || key === 'dayPlans';
    const toSave = (typeof value !== 'undefined' && value !== null) ? value : map[key]; // the MERGED copy when the merge ran
    // What the cloud last confirmed: the upload merges against it, even after a
    // reopen — kept before the phone's copy is replaced (the copy it replaces
    // holds the base of a visit this save is the first to change, v123 review).
    if(queueable) keepMergeBaseOnPhone(key);
    const mOk = mirrorSave(key, JSON.stringify(toSave));
    let onPhone = mOk;
    if(queueable){
      // Queued even when the device store is full: the copy in memory still
      // uploads the moment the cloud is back — as long as the app stays open.
      onPhone = outboxAdd(key) && mOk; // the queue entry and the copy, both on the phone
      if(lost) parkSave(key, 'noAccess');
      if(!onPhone){ _memOnly.add(key); renderMemOnlyBar(); } // the truth stays on screen until it uploads
      updateSyncBadge();
      if(lost || unsure) noAccessToast(onPhone ? (lost ? NO_ACCESS_KEPT : ACCESS_UNKNOWN_KEPT) : '⚠️ Device storage full — kept in memory only: keep the app open until it uploads');
      else offlineToast(onPhone ? '📴 Saved on this device — uploads automatically when back online'
                                : '⚠️ Device storage full — kept in memory only: keep the app open until it uploads');
    } else {
      if(WHOLE_DOCS.includes(key)) keepDocBaseOnPhone(key, JSON.stringify(toSave)); // the phone's copy now holds an edit the cloud has not: keep what the cloud held beside it
      if(lost || unsure) noAccessToast(lost ? NO_ACCESS_NOT_SAVED : ACCESS_UNKNOWN_NOT_SAVED);
      else offlineToast(mOk ? '📴 No connection — retry this save when back online'
                            : '⚠️ Device storage full — retry this save when back online');
    }
    // a whole document whose answer did not come in time may still land (followed above): said as "no answer yet", never as "not saved"
    tell({ ok: false, queued: !!queueable, mirrored: onPhone, noAccess: lost || undefined, accessUnknown: unsure || undefined, timeout: !queueable && /timeout/.test(String(e && e.message)) });
    return false;
  }
}
// A whole document's merge with the cloud's copy (the recycle bin, the ERP
// notes), three ways against the text the copy on screen came from (`loaded`:
// null = there was no document, undefined = never read → a union).
function mergeWholeDoc(key, mine, cloud, loaded){
  const empty = key === 'recycleBin' ? { clinics: [], products: [], visits: [] } : {};
  const base = loaded === undefined ? null : (loaded === null ? empty : UMCore.safeParse(loaded, null));
  if(key === 'recycleBin'){
    const m = Object.assign({ clinics: [], products: [], visits: [] }, typeof UMCore.mergeRecycleBin3 === 'function' ? UMCore.mergeRecycleBin3(mine, cloud, base) : UMCore.mergeRecycleBin(cloud, mine));
    // the bin keeps 30 days on every write (v123), whatever another phone's copy still held
    const cutoff = Date.now() - (typeof BIN_DAYS === 'number' ? BIN_DAYS : 30) * 86400000;
    ['clinics', 'products', 'visits'].forEach(k => { m[k] = (Array.isArray(m[k]) ? m[k] : []).filter(x => x && (x._deletedAt || 0) > cutoff); });
    return m;
  }
  return typeof UMCore.mergeKeyed3 === 'function' ? UMCore.mergeKeyed3(mine, cloud, base) : Object.assign({}, cloud, mine);
}
// The cloud now holds `str` for a whole document: it is the base of the next
// compare-and-set and the phone's copy; a merged document's screen copy takes
// what the merge kept from other phones (and keeps what changed here since).
// A save that landed late (`late`) after a refresh had read the document again
// is left to the next refresh (the copy on screen is that read's).
function wholeDocLanded(key, str, loaded, late){
  if(late && _docLoaded[key] !== loaded) return;
  refusedSave(key, null); // a save of it landed: no refusal left to say
  _docLoaded[key] = str;
  delete _loadFailed[key]; delete _mirrorUsed[key];
  mirrorSave(key, str);
  dropDocBaseOnPhone(key);
  if(key === 'recycleBin' || key === 'erpNotes'){
    const w = UMCore.safeParse(str, null);
    if(w && typeof w === 'object'){
      if(key === 'recycleBin') recycleBin = mergeWholeDoc(key, recycleBin, w, loaded);
      else erpNotes = mergeWholeDoc(key, erpNotes, w, loaded);
    }
  }
}
// A whole document whose save was refused stays said by a bar until a save of
// it lands or it is tapped away (v123): several screens still say "saved"
// right after a save whatever its outcome, and that toast would otherwise be
// the last word.
const REFUSED_ELSEWHERE = '⚠️ Not saved — changed on another device. Reopen the app, then save again';
const REFUSED_NOT_READ = '⚠️ Not saved — this did not load from the cloud. Reopen the app, then save again';
const _refused = new Map(); // key → what to say
function refusedSave(key, msg){
  if(msg) _refused.set(key, msg); else if(!_refused.delete(key)) return;
  let el = document.getElementById('refusedPill');
  if(!_refused.size){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'refusedPill'; el.setAttribute('role', 'alert');
    el.className = 'sbar sbar-pill sbar-danger sbar-tap';
    el.onclick = () => { _refused.clear(); el.remove(); };
    document.body.appendChild(el);
  }
  const last = [..._refused.values()].pop();
  el.textContent = trOf(last) || last;
}
// ---- Saves that can never land as they are (v123) ----
// Until v122 every failed save was "offline": a save the security rules
// refuse, and a document larger than the cloud stores, were queued with
// "Saved on this device — uploads automatically", retried every 20 seconds
// for ever, and while a list waited in the queue this phone stopped showing
// the others' changes to it. Now each is told for what it is.
const DOC_MAX_BYTES = 1000000; // the cloud refuses a document above 1 MiB (1,048,576 bytes with its name and fields): a value above this never lands
const NOT_ALLOWED_MSG = '🔒 Not allowed, not saved (ask the supervisor)';
// A phone with no access to the team's data (v123 review): what it saves stays on it
const NO_ACCESS_KEPT = "🔒 Kept on this phone — no access to the team's data right now (signed out?). It uploads by itself after you sign in again";
const NO_ACCESS_NOT_SAVED = "🔒 Not saved — no access to the team's data right now (signed out?). Sign in again, then save again";
// The cloud refused a save and did not answer whether this login may save at all (round 3): kept, tried again
const ACCESS_UNKNOWN_KEPT = "🔒 Kept on this phone — the cloud did not answer whether this login may save it; it is tried again";
const ACCESS_UNKNOWN_NOT_SAVED = "🔒 Not saved — the cloud did not answer whether this login may save it. Try again in a moment";
// A queued list the rules refuse for this login (it is kept on this phone, never "not saved")
const REFUSED_KEPT = "🔒 Not allowed for this login — kept on this phone, not sent (ask the supervisor)";
let _noAccessToastAt = 0;
function noAccessToast(msg){ if(Date.now() - _noAccessToastAt < 60000) return; _noAccessToastAt = Date.now(); showToast(msg, 7000); }
// A save the security rules refused: the rules' "no" for this login — or has
// this phone lost its access to the team's data altogether (signed out; a
// sign-in that ended: a password changed on another device, the login
// disabled or reset)? It is the rules' only when the app is signed in, the
// sign-in still holds (a fresh token) and the cloud answers a read right now;
// anything else keeps the change on this phone (v123 review: a refused save
// emptied the queue, and every save of a phone whose sign-in had ended was
// refused). Asked only after a refusal: it costs a save nothing otherwise.
// → 'ok' (this login has access: the refusal is the rules'), 'lost' (signed
// out, a sign-in that ended, reads refused too) or 'unknown' (round 3: the
// check itself got no answer in time, or no connection — kept and tried
// again, and said for what it is: never "signed out?", never "not saved").
async function accessCheck(){
  if(!currentUser) return 'lost';
  // a refused read, or an auth answer that the sign-in is over → lost; no answer, no network → unknown
  const why = e => { const c = String(e && e.code || ''); return (saveErrKind(e) === 'refused' || (/^auth\//.test(c) && !/network|internal|too-many/.test(c))) ? 'lost' : 'unknown'; };
  try{
    if(FIREBASE_ENABLED && window.firebase && typeof firebase.auth === 'function'){
      const u = firebase.auth().currentUser;
      if(!u) return 'lost';
      await withTimeout(u.getIdToken(true), 8000);
    }
  }catch(e){ return why(e); }
  try{ await withTimeout(window.storage.get('staff', true, { server: true }), 6000); return 'ok'; }
  catch(e){ return why(e); }
}
// A queued list the cloud refused: it stays queued and on this phone, and the
// round leaves it until it can land (see _saveParked); the red bar says so.
const _parkedAt = new Map();          // key → when it was parked (a refused list is sent again after PARK_RETRY_MS)
const PARK_RETRY_MS = 60 * 60000;
function parkSave(key, why){ _saveParked.set(key, why); _parkedAt.set(key, Date.now()); renderTooLargeBar(); updateSyncBadge(); }
function unparkSaves(why){
  let n = 0;
  [..._saveParked.keys()].forEach(k => { if(!why || _saveParked.get(k) === why){ _saveParked.delete(k); _parkedAt.delete(k); n++; } });
  if(n){ renderTooLargeBar(); updateSyncBadge(); }
  return n;
}
const PARKED_NO_ACCESS = "🔒 Changes wait on this phone, not sent: no access to the team's data right now (signed out, or the password was changed on another device). Sign in again — they upload by themselves.";
const PARKED_REFUSED = "🔒 Changes wait on this phone, not sent: the cloud does not allow this login to save them. Ask the supervisor — they stay on this phone.";
// 'refused' (the security rules said no) | 'tooLarge' (over the cloud's size
// limit) | null (anything else: no connection, a timeout — the offline path)
function saveErrKind(e){
  if(!e) return null;
  if(e.tooLarge) return 'tooLarge';
  const code = String(e.code || ''), msg = String(e.message || e);
  if(/permission[-_]denied/i.test(code) || /missing or insufficient permissions|permission[-_]denied/i.test(msg)) return 'refused';
  if(/invalid[-_]argument/i.test(code) && /size|exceed|too (big|large)|maximum/i.test(msg)) return 'tooLarge';
  if(/exceeds the maximum allowed size|cannot be written because its size|document too large/i.test(msg)) return 'tooLarge';
  return null;
}
function tooLargeError(key, month, bytes){
  const e = new Error('document too large: ' + key + (month ? ' ' + month : ''));
  e.tooLarge = true; e.key = key; e.month = month || null; e.bytes = bytes || null;
  return e;
}
// Lists this phone holds changes for that the cloud cannot take because the
// document is too large: still queued (they are kept on this phone — never
// thrown away), but never sent by the 20-second round; a save of the same
// list from a tap tries again, and so does the bar's "Try again".
// (_saveBlocked and _tooLarge are declared at the top of this file: the sync badge reads them)
let _refusedToastAt = 0;
// What to do, said with the month or the list (the bar and the toasts).
function tooLargeMonthLabel(m){
  if(!/^\d{4}-\d{2}$/.test(m || '')) return m || '';
  const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1);
  try{ return d.toLocaleDateString(uiLang === 'ar' ? 'ar-KW-u-nu-latn' : 'en-US', { month: 'long', year: 'numeric' }); }catch(e){ return m; }
}
const TOO_LARGE_LIST = { erpSales: 'the sales file', clinics: 'the clinic list', tasks: 'the tasks', events: 'the events', dayPlans: 'the day plans', chat: 'the team chat', memories: 'the memories', recycleBin: 'the recycle bin', products: 'the product catalog', targets: 'the targets', erpNotes: 'the sales notes', staff: 'the team list', benchmarks: 'the settings', categoryGuides: 'the category guides', tombs: 'the delete log' };
function tooLargeText(t){
  if(t.key === 'visits') return `🛑 Not saved: the visits of ${tooLargeMonthLabel(t.month)} are too large for the cloud (too many photos). Remove some photos from that month's visits (Edit visit → ×), then save again.` + (t.kept ? ' What this phone holds for them stays on this phone.' : '');
  return `🛑 Not saved: ${TOO_LARGE_LIST[t.key] || t.key} is too large for the cloud. Ask the supervisor — nothing else was changed.` + (t.kept ? ' What this phone holds stays on this phone.' : '');
}
function renderTooLargeBar(){
  let el = document.getElementById('tooLargeBar');
  const items = Object.keys(_tooLarge).map(k => _tooLarge[k]);
  const parked = [..._saveParked.values()]; // queued lists the cloud refused (v123 review): on this bar too
  if(!items.length && !parked.length){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'tooLargeBar'; el.setAttribute('role', 'alert'); el.setAttribute('data-notr', '');
    el.className = 'sbar sbar-wide sbar-danger';
    document.body.appendChild(el);
  }
  const retry = (items.some(t => t.kept) || parked.length) ? `<button class="chip small" style="margin-top:6px; background:#fff; color:var(--status-danger); border-color:#fff;" onclick="retryBlockedSaves()">${esc(trOf('Try again') || 'Try again')}</button>` : '';
  const lines = items.map(tooLargeText).concat(parked.length ? [parked.includes('noAccess') ? PARKED_NO_ACCESS : PARKED_REFUSED] : []);
  const html = lines.map(t => `<div>${esc(trOf(t) || t)}</div>`).join('') + retry;
  if(el.innerHTML !== html) el.innerHTML = html; // an alert: said again only when it changes
}
function noteTooLarge(id, info){ _tooLarge[id] = info; renderTooLargeBar(); }
function clearTooLarge(id){ if(_tooLarge[id]){ delete _tooLarge[id]; renderTooLargeBar(); } }
// A save of `key` landed: what the bar said about that list is over. (A
// month of visits leaves the bar when ITS document is written — persistVisitsInner.)
function saveUnblocked(key){
  _saveBlocked.delete(key);
  if(_saveParked.delete(key)){ renderTooLargeBar(); updateSyncBadge(); }
  if(key !== 'visits') clearTooLarge(key);
}
// The bar's "Try again": a list kept on this phone is sent once more (a list
// the cloud refused too: v123 review).
async function retryBlockedSaves(){
  const keys = [...new Set([..._saveBlocked, ..._saveParked.keys()])];
  _saveBlocked.clear(); unparkSaves();
  for(const k of keys){ if(k === 'chat' || k === 'memories') await persistTeam(k); else if(k === 'tombs') await persistTombs(); else await persist(k); }
}
// What a save that cannot land does, and what it tells (persistNow's outcome).
function saveBlocked(key, kind, e){
  const queued = outboxHas(key);
  if(kind === 'refused'){
    console.warn('save refused by the security rules: ' + key, e && (e.code || e.message)); // said on screen
    // What already waits in the queue stays there and on this phone — never
    // thrown away (v123 review: it was taken off the queue, set aside where
    // nothing read it, and the next refresh put the cloud's copy over it).
    // Parked: the 20-second round stops sending it; a new sign-in, the bar's
    // "Try again" or the next start sends it again. This save itself is not
    // saved, and said so.
    if(queued) parkSave(key, 'refused');
    // what waits in the queue is kept on this phone: never "not saved" for it (round 3)
    if(Date.now() - _refusedToastAt > 3000){ _refusedToastAt = Date.now(); showToast(queued ? REFUSED_KEPT : NOT_ALLOWED_MSG, 6000); }
    return { ok: false, refused: true, denied: true, queued: false, mirrored: false, keptQueued: queued || undefined };
  }
  // too large: never queued; a list already queued on this phone stays there
  // (its changes are kept) but is not sent again by itself
  const month = (e && e.month) || null, bytes = (e && e.bytes) || null;
  console.warn('document too large for the cloud: ' + key + (month ? ' ' + month : '') + (bytes ? ' (' + bytes + ' bytes)' : '')); // said on screen (the bar)
  if(queued) _saveBlocked.add(key);
  noteTooLarge(key === 'visits' && month ? 'visits:' + month : key, { key, month, bytes, kept: queued });
  showToast(key === 'visits'
    ? (month && month !== todayStr().slice(0, 7) ? `🛑 زيارات شهر ${month} كبيرة جدًا — لم تُحفظ: احذف بعض صورها ثم أعد المحاولة` : '🛑 زيارات هذا الشهر كبيرة جدًا (صور كثيرة) — لم تُحفظ: احذف بعض الصور من الزيارات ثم أعد المحاولة')
    : tooLargeText({ key, month, kept: queued }), 7000);
  return { ok: false, tooLarge: true, month, bytes, queued, mirrored: queued };
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
// persist(key) with what THIS call did and nothing else: { ok, outcome }.
// Unlike persistFor it never falls back on an earlier save's outcome — a
// save refused before it tried (a guard; persist's own words say why) reads
// as not saved, never as "kept on this device". (The same contract as the
// change-log branch's persistTold.)
function persistTold(key, opts){
  let info = null;
  const told = (ok, refused) => ({ ok: ok === true, outcome: info || { ok: ok === true, queued: false, mirrored: false, refused: !!refused && ok !== true } });
  return persist(key, Object.assign({}, opts || {}, { told: x => { info = x; } }))
    .then(ok => told(ok, true), e => { console.warn('save of ' + key + ' failed', e); return told(false, false); });
}
// The words for a save that did not land, from what it did (persistTold /
// persistFor): refused by the rules, too large for the cloud, kept on this
// phone (it uploads by itself), or not saved. null: it landed, or persist's
// own words already say why (a guard). [text, ms]
function saveFailText(r, key){
  if(!r || r.ok === true || (!!key && sentSince(key, r))) return null;
  const o = r.outcome || {};
  if(o.denied) return [o.keptQueued ? REFUSED_KEPT : NOT_ALLOWED_MSG, 6000];
  if(o.tooLarge) return [tooLargeText({ key, month: o.month || (key === 'visits' ? todayStr().slice(0, 7) : null), kept: !!o.queued }), 8000];
  if(o.quiet) return null;
  if(o.erp) return ['⚠️ Not saved yet — tap the red bar to try again', 5000];
  // no access to the team's data (signed out): kept and queued, or not saved (a whole document) — v123 review
  if(o.noAccess) return [!o.queued ? NO_ACCESS_NOT_SAVED : o.mirrored ? NO_ACCESS_KEPT : '⚠️ Device storage full — kept in memory only: keep the app open until it uploads', 7000];
  if(o.accessUnknown) return [!o.queued ? ACCESS_UNKNOWN_NOT_SAVED : o.mirrored ? ACCESS_UNKNOWN_KEPT : '⚠️ Device storage full — kept in memory only: keep the app open until it uploads', 7000]; // (round 3)
  if(o.queued && o.mirrored) return ['📴 Saved on this device — uploads automatically when back online', 4000]; // the same words as persist's own offline notice
  if(o.queued) return ['⚠️ Not saved on this device (storage full) — keep the app open until it uploads', 5000];
  if(o.refused) return ['⚠️ Not saved — reopen the app, then try again', 5000];      // a guard refused it before any write
  if(o.timeout) return ['⏳ No answer from the cloud yet — check the connection, then reopen this screen to see whether it was saved', 6000];
  return ['⚠️ Not saved — check the connection and try again', 4000];
}
// The toast for one save: okMsg only when it landed, else what really
// happened — "saved" never covers a failure. Returns whether it landed.
function saveToast(r, key, okMsg, ms){
  const landed = !!r && (r.ok === true || (!!key && sentSince(key, r)));
  if(landed){ if(okMsg) showToast(okMsg, ms); return true; }
  const t = saveFailText(r, key);
  if(t) showToast(t[0], t[1]);
  return false;
}
// One message for a change saved in several lists: okMsg only when every one
// landed; else what the first that did not land did. pairs: [[result, key], …]
function saveToastAll(pairs, okMsg, ms){
  const miss = (pairs || []).find(([r, k]) => r && !(r.ok === true || sentSince(k, r)));
  if(!miss){ if(okMsg) showToast(okMsg, ms); return true; }
  saveToast(miss[0], miss[1], okMsg, ms);
  return false;
}
// Atomic read-merge-write where the storage supports it; a plain (non-atomic)
// read → fn → write otherwise, with the same contract.
// onRaw(p): the write itself, which goes on after the time limit (a commit on its way can still
// land) — a caller that must know whether it landed in the end follows it (the whole-day Restore, round 4)
async function storageUpdate(key, fn, ms, onRaw){
  if(typeof window.storage.update === 'function'){ const p = window.storage.update(key, fn); if(typeof onRaw === 'function') onRaw(p); return withTimeout(p, ms || 12000); }
  const cur = await withTimeout(window.storage.get(key, true), 5000);
  const next = fn(cur ? cur.value : null);
  if(next == null) return null;
  const sp = window.storage.set(key, next, true);
  if(typeof onRaw === 'function') onRaw(sp.then(ok => ok ? next : null));
  const ok = await withTimeout(sp, 7000);
  if(!ok) throw new Error('set failed');
  return next;
}
const SNAP_DAY = 'um_snapDay'; // this phone already found or wrote today's backup (v119: no download of it on every start)
// The daily backup's document: the clinics, the catalog, this month's visits,
// the tasks and the sales index — as they are in memory now (`extra` adds
// fields: the whole-day Restore marks the copy it keeps before restoring).
function snapshotDoc(extra){
  // The sales index is tiny and its chunks stay in the cloud for a week
  // after being replaced, so the daily backup can restore the sales files too.
  const erpIndex = (!_loadFailed.erpSales && !_mirrorUsed.erpSales && !erpPeriods().some(p => p && p.rowsMissing)) ? UMCore.erpSplitForStorage(erpSales).index : undefined;
  // Visits: this month only — past months sit in their own archive documents
  // (untouched by day-to-day saves), which keeps the backup well under the cap.
  const vp = UMCore.visitsPartition(visits, todayStr());
  const visitsMonths = {}; Object.keys(vp.months).forEach(m => { visitsMonths[m] = vp.months[m].length; });
  return Object.assign({clinics: storedClinics(), products, visits: vp.live, visitsMonths, tasks, erpIndex, ts: new Date().toISOString()}, extra || {});
}
// The daily backup is ONE document, so the cloud's size limit is its limit
// too (v123). Measured before it is written: above SNAP_SLIM_BYTES the
// visits keep their photos' ids but not their small previews (the full
// photos are their own documents; a whole-day Restore puts back the preview
// this phone holds under the same id); still over the limit, it is not
// written and that is said. After a failure this phone waits an hour before
// it tries again — every try sends the whole backup.
const SNAP_SLIM_BYTES = 900000;
const SNAP_RETRY_MS = 3600000;
const SNAP_FAIL = 'um_snapFail'; // { day, at, why: 'tooLarge' | 'refused' | 'failed', bytes } — this phone's last failed daily backup
let _snapRunning = false;        // one at a time: saves call it in bursts
function snapFailInfo(){ try{ const f = UMCore.safeParse(localStorage.getItem(SNAP_FAIL), null); return f && typeof f === 'object' ? f : null; }catch(e){ return null; } }
function snapFailed(day, why, bytes){
  console.warn('daily backup not saved: ' + why + (bytes ? ' (' + bytes + ' bytes)' : '')); // said on the backups screen
  try{ localStorage.setItem(SNAP_FAIL, JSON.stringify({ day, at: Date.now(), why, bytes: bytes || null })); }catch(e){}
}
function snapDone(day){ try{ localStorage.setItem(SNAP_DAY, day); localStorage.removeItem(SNAP_FAIL); }catch(e){} }
// The day's backup is taken only from a copy that is the cloud's: the lists it
// holds all read in the refresh on screen — none failed (a new phone, cleared
// site data: v123 review, a backup with none of the month's visits, which no
// team phone may then replace), none served from the phone's copy, none
// waiting in the queue — and no start that went wrong.
function snapshotReadOk(){ return !snapshotBlockedWhy(); }
// Why this phone does not take the day's backup right now (said on the backups
// screen while today has none, round 3): 'copy' — a list on screen did not come
// from the cloud (a read that failed, a list shown from this phone's copy, a
// start that went wrong); 'queued' — changes of this phone's still wait to
// upload; null — nothing holds it back.
function snapshotBlockedWhy(){
  if(!_bootLoaded || _bootCrashed || _seedClinics || Object.keys(_mirrorUsed).length) return 'copy';
  if(keptOnScreen()) return 'copy'; // a past month from the phone's store, not read from the cloud this session yet (v126)
  if(['clinics', 'visits', 'tasks', 'products'].some(k => _loadFailed[k])) return 'copy';
  return ['clinics', 'visits', 'tasks'].some(k => outboxHas(k)) ? 'queued' : null;
}
async function maybeSnapshot(){
  if(_snapRunning) return;
  if(!snapshotReadOk()){ if(keptMonthsOnScreen()) _keptForSnap = true; return; } // a past month from the phone's store: tried again once it is read from the cloud (loadAllNow, v126)
  const day = todayStr(), key = 'snap_' + day;
  try{ if(localStorage.getItem(SNAP_DAY) === day) return; }catch(e){}
  const fail = snapFailInfo();
  if(fail && fail.day === day && Date.now() - (fail.at || 0) < SNAP_RETRY_MS) return; // tried within the hour: not again yet
  _snapRunning = true;
  try{
    const existing = await window.storage.get(key, true).catch(()=>null);
    if(existing){ snapDone(day); return; } // already snapshotted today
    const out = UMCore.snapshotPayload(snapshotDoc(), { slimAt: SNAP_SLIM_BYTES, max: DOC_MAX_BYTES });
    if(out.tooLarge){ snapFailed(day, 'tooLarge', out.bytes); return; }
    if(out.slimmed) console.warn(`daily backup: ${out.slimmed} photo previews left out to stay under the size limit (${out.bytes} bytes)`);
    try{ await window.storage.set(key, out.str, true); }
    catch(e){
      // another phone may have written today's backup meanwhile (the team only creates one; the supervisor may replace it)
      const now = await window.storage.get(key, true).catch(()=>null);
      if(now){ snapDone(day); return; }
      const kind = saveErrKind(e);
      snapFailed(day, kind === 'tooLarge' ? 'tooLarge' : kind === 'refused' ? 'refused' : 'failed', kind === 'tooLarge' ? out.bytes : null);
      return;
    }
    snapDone(day);
    // Keep 12 days: the backups that aged out are deleted by name — listing
    // them would download every backup in full (the cloud has no light listing).
    for(let i = 13; i <= 19; i++){
      const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() - i);
      await window.storage.delete('snap_' + UMCore.localDateStr(d), true).catch(()=>null);
    }
  }catch(e){ console.error('snapshot error', e); snapFailed(day, 'failed', null); }
  finally{ _snapRunning = false; }
}

