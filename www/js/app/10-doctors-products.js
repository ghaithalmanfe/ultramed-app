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
function productBrandPick(b){ const e = document.getElementById('productSearch'); if(e){ e.value = b || ''; renderProducts(); } }
function renderProducts(){
  const q = (document.getElementById('productSearch').value||'').toLowerCase();
  const wrap = document.getElementById('productListWrap');
  const filtered = products.filter(p=>p.name.toLowerCase().includes(q) || (p.brand||'').toLowerCase().includes(q));
  const byBrand = {};
  filtered.forEach(p=>{ const b = p.brand||'Other'; (byBrand[b]=byBrand[b]||[]).push(p); });
  const brands = Object.keys(byBrand).sort((a,b)=>byBrand[b].length-byBrand[a].length || a.localeCompare(b));
  brands.forEach(b=>byBrand[b].sort((x,y)=>(x.cat||'').localeCompare(y.cat||'')||x.name.localeCompare(y.name)));
  const gapNote = catalogGapNote() + productDupNote();
  if(brands.length===0){ wrap.innerHTML = gapNote + `<div class="empty">No products found.</div>`; return; }
  if(q) brands.forEach(b=>openBrands.add(b));
  // one row of brand chips (the brand's colour, its count): a tap searches that brand — the search box's own filter
  const chipsEl = document.getElementById('productBrandChips');
  if(chipsEl){
    const all = {}; products.forEach(p => { const b = p.brand || 'Other'; all[b] = (all[b] || 0) + 1; });
    const qb = q.trim();
    chipsEl.innerHTML = `<button class="chip small ${!qb ? 'on' : ''}" onclick="productBrandPick('')">All (${products.length})</button>` + Object.keys(all).sort((a, b) => all[b] - all[a] || a.localeCompare(b))
      .map(b => `<button class="chip small pr-chip ${qb && qb === b.toLowerCase() ? 'on' : ''}" data-brand="${esc(b)}" onclick="productBrandPick(this.dataset.brand)"><i class="swatch" style="background:${brandColor(b)}"></i><span dir="auto">${esc(b)}</span> <span data-notr>(${all[b]})</span></button>`).join('');
  }
  wrap.innerHTML = gapNote + brands.map(b=>{
    const open = openBrands.has(b);
    return `<div class="brand-group card" style="padding:6px 12px;">
      <div class="brand-head" data-brand="${esc(b)}" onclick="toggleBrand(this.dataset.brand)">
        <span style="display:flex; align-items:center; gap:9px;"><span class="swatch" style="width:12px;height:12px;border-radius:4px;background:${brandColor(b)}"></span>${esc(b)} <span class="count">(${byBrand[b].length})</span></span>
        <span style="color:var(--muted);">${open?'−':'+'}</span>
      </div>
      <div class="brand-body ${open?'open':''}" id="brand-${slugify(b)}">
        ${byBrand[b].map(p=>`<div class="product-item" style="cursor:pointer;" onclick="openProductDetail('${jsArg(productKey(p))}')">${prodThumb(p)}<div class="pinfo"><div class="pname2">${esc(p.name)}${p.stock===false?' <span style="font-size:10px; background:var(--coral-dim); color:var(--coral-ink); padding:1px 6px; border-radius:6px; font-weight:700;">OUT</span>':''}</div><div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${esc(p.cat||'Tap for specs')}${p.id ? ` <span data-notr>· ${esc(p.id)}</span>` : ''}</div></div><span class="product-price">${p.price!=null?money(p.price):''}</span></div>`).join('')}
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
  // the image URL is team-typed data (a rep's "+ Add product" has no supervisor check, so any phone can store it):
  // keep it inside src="…" (esc) and only an http(s) one (safeUrl), else the brand tile — never markup (security review)
  const src = safeUrl(p.img);
  if(!src) return fb;
  return `<img class="${c}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fbc="${col}" data-fbl="${letter}" onerror="imgFallback(this)">`;
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
// ---- ADD PRODUCT (v130, the owner's request of 25 Nov: a new product joins the system as it should) ----
// The sales files name products and brands as text: an invoice line finds its catalog product by name and brand, its
// selling guide by category, the order lines and the duplicate check by the item code and the barcode. The sheet
// suggests what the system already knows (the names the sales files invoice, the brands, the categories), fills the
// brand and the usual invoiced price from the files, files the brand under the catalog's own spelling (said under the
// field), refuses a name, an item code or a barcode the catalog already has, and asks first (a second tap saves) for
// a product with no category or a name that says one already in the catalog another way (UMCore.productAddCheck).
let _addProdAsked = null;            // the draft the sheet's question was asked for: Save again saves it
const _addProdInFlight = new Set();  // names whose save has had no answer yet (a second save would add it twice)
let _prodFactsMemo = { k: null, v: null };
function productFacts(){
  const periods = UMCore.erpPeriodsOf(erpSales);
  const k = periods.map(p => p.id + ':' + (p.rows || []).length).join(',');
  if(_prodFactsMemo.k === k && _prodFactsMemo.v) return _prodFactsMemo.v;
  const rows = []; periods.forEach(p => UMCore.unpackErpRows(p.rows).forEach(r => rows.push(r)));
  _prodFactsMemo = { k, v: UMCore.erpProductFacts(rows) };
  return _prodFactsMemo.v;
}
function productCheckCtx(except){ return { products, facts: productFacts(), guides: categoryGuides || {}, except: except || null }; }
function openAddProduct(){
  _addProdAsked = null;
  const facts = productFacts(), vocab = UMCore.productVocab(products, facts, categoryGuides || {});
  const inCatalog = new Set(products.map(p => p && UMCore.productNameKey(p.name)));
  const names = Object.keys(facts).filter(k => !inCatalog.has(k)).map(k => facts[k]).sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name)).slice(0, 400);
  const opts = list => list.map(v => `<option value="${esc(v)}"></option>`).join('');
  showModal(`
    <h3 style="margin-top:0;" data-ic="package"><span>Add product</span></h3>
    <p class="ap-intro"><span>Write it as the sales files and the price list write it: the app finds its sales by name and brand, and its selling guide by category.</span></p>
    <label for="mProdName">Product name</label>
    <input type="text" id="mProdName" list="mProdNames" autocomplete="off" placeholder="e.g. Digital X-ray Sensor" oninput="addProdInput('name')">
    <datalist id="mProdNames">${opts(names.map(x => x.name))}</datalist>
    <div class="ap-note" id="apNoteName"></div>
    <label for="mProdBrand">Brand</label>
    <input type="text" id="mProdBrand" list="mProdBrands" autocomplete="off" placeholder="e.g. Philips" oninput="this.dataset.auto=''; addProdInput()">
    <datalist id="mProdBrands">${opts(vocab.brands)}</datalist>
    <div class="ap-note" id="apNoteBrand"></div>
    <label for="mProdCat">Category</label>
    <input type="text" id="mProdCat" list="mProdCats" autocomplete="off" placeholder="e.g. Interdental" oninput="addProdInput()">
    <datalist id="mProdCats">${opts(vocab.cats)}</datalist>
    <div class="ap-note" id="apNoteCat"></div>
    <label for="mProdCode">Product code (optional)</label>
    <input type="text" id="mProdCode" autocomplete="off" placeholder="The item code in the price list" oninput="addProdInput()">
    <div class="ap-note" id="apNoteCode"></div>
    <label for="mProdBarcode">Barcode (optional)</label>
    <input type="text" id="mProdBarcode" inputmode="numeric" autocomplete="off" oninput="addProdInput()">
    <div class="ap-note" id="apNoteBarcode"></div>
    <label for="mProdPrice">Price (KD, optional)</label>
    <input type="text" id="mProdPrice" inputmode="decimal" autocomplete="off" placeholder="e.g. 12.5" oninput="this.dataset.auto=''; addProdInput()">
    <div class="ap-note" id="apNotePrice"></div>
    <label for="mProdImg">Image URL (optional)</label>
    <input type="text" id="mProdImg" autocomplete="off" placeholder="Paste a direct image link">
    <div id="apAsk"></div>
    <button class="btn" id="apSave" onclick="submitAddProduct()">Save product</button>
  `);
  addProdInput();
}
function addProdDraft(){
  const v = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  return { name: v('mProdName'), brand: v('mProdBrand'), cat: v('mProdCat'), code: v('mProdCode'), barcode: v('mProdBarcode'), price: v('mProdPrice') };
}
function apNote(id, text, tone){
  const el = document.getElementById(id); if(!el) return;
  el.textContent = text || '';
  el.className = 'ap-note' + (tone ? ' ' + tone : '');
}
function addProdInput(src){
  const nameEl = document.getElementById('mProdName'); if(!nameEl) return;
  const facts = productFacts();
  const sale = facts[UMCore.productNameKey(nameEl.value)] || null;
  // the brand and the price come from the sales files into a field the person has not typed into (data-auto)
  let filled = false;
  const fill = (id, val) => { const el = document.getElementById(id); if(!el || !(el.value === '' || el.dataset.auto === '1')) return false;
    const t = val == null ? '' : String(val); el.value = t; el.dataset.auto = t ? '1' : ''; return !!t; };
  if(src === 'name'){ if(fill('mProdBrand', sale ? sale.brand : '')) filled = true; if(fill('mProdPrice', sale && sale.price != null ? sale.price : '')) filled = true; }
  const autoNow = ['mProdBrand', 'mProdPrice'].some(id => { const el = document.getElementById(id); return el && el.dataset.auto === '1'; });
  const ck = UMCore.productAddCheck(addProdDraft(), productCheckCtx());
  const err = f => ck.errors.find(e => e.field === f);
  const draftName = nameEl.value.trim();
  // the name
  const en = err('name');
  if(en && en.kind === 'name-taken') apNote('apNoteName', 'Already in the catalog', 'bad');
  else if(sale) apNote('apNoteName', `Sold ${sale.sold} in the sales files${sale.last ? ', last ' + fmtDate(sale.last) : ''}` + ((filled || autoNow) ? ' — brand and price filled in from them' : ''), 'ok');
  else if(draftName && Object.keys(facts).length) apNote('apNoteName', 'No sale under this exact name in the sales files yet');
  else apNote('apNoteName', '');
  // the brand
  if(ck.brandIs === 'catalog' && ck.renamedFrom) apNote('apNoteBrand', `Filed under the catalog's brand “${ck.brand}”`, 'ok');
  else if(ck.brandIs === 'files') apNote('apNoteBrand', 'Known from the sales files');
  else if(ck.brandIs === 'new') apNote('apNoteBrand', 'New brand — not in the catalog or the sales files yet. Check the spelling.', 'warn');
  else apNote('apNoteBrand', '');
  // the category
  const catTyped = (document.getElementById('mProdCat') || {}).value || '';
  if(!catTyped.trim()) apNote('apNoteCat', draftName ? 'Without a category it is in no selling guide and not in a clinic’s sell guide' : '', draftName ? 'warn' : '');
  else if(ck.catIs === 'new') apNote('apNoteCat', 'New category — its selling guide starts empty', 'warn');
  else apNote('apNoteCat', ck.guide ? 'Has a selling guide' : 'This category has no selling guide yet');
  // the code, the barcode, the price
  const ec = err('code'), eb = err('barcode'), ep = err('price');
  if(ec) apNote('apNoteCode', `Already the code of ${ec.product}`, 'bad');
  else apNote('apNoteCode', ((document.getElementById('mProdCode') || {}).value || '').trim() ? '' : 'Left empty, the app gives it a code of its own');
  if(eb) apNote('apNoteBarcode', eb.kind === 'barcode-bad' ? 'Digits only — 6 or more' : `Already the barcode of ${eb.product}`, 'bad');
  else apNote('apNoteBarcode', '');
  apNote('apNotePrice', ep ? 'Enter a price of 0 or more' : '', ep ? 'bad' : '');
  // a question asked for an earlier draft is not this draft's
  if(_addProdAsked !== null && _addProdAsked !== JSON.stringify(addProdDraft())){ _addProdAsked = null; const a = document.getElementById('apAsk'); if(a) a.innerHTML = ''; }
}
const AP_FIELD = { name: 'mProdName', code: 'mProdCode', barcode: 'mProdBarcode', price: 'mProdPrice' };
function addProdErrText(e){
  if(e.kind === 'name-missing') return 'Enter a product name';
  if(e.kind === 'name-taken') return 'That product already exists';
  if(e.kind === 'code-taken') return `Not saved — that product code is already used by ${e.product}`;
  if(e.kind === 'barcode-bad') return 'Not saved — a barcode is digits only (6 or more)';
  if(e.kind === 'barcode-taken') return `Not saved — that barcode is already used by ${e.product}`;
  if(e.kind === 'price-bad') return 'Not saved — enter a price of 0 or more';
  return 'Not saved';
}
async function submitAddProduct(){
  const draft = addProdDraft(), sig = JSON.stringify(draft);
  const ck = UMCore.productAddCheck(draft, productCheckCtx());
  if(ck.errors.length){
    const e = ck.errors[0];
    showToast(addProdErrText(e));
    const f = document.getElementById(AP_FIELD[e.field]); if(f) f.focus();
    return;
  }
  // a plain http(s) image link only — no spaces or quote/angle characters a link never has (security review: the
  // render escapes it too, but a clean value never carries an attribute breakout in the first place)
  const imgVal = ((document.getElementById('mProdImg') || {}).value || '').trim();
  const imgOk = safeUrl(imgVal) && !/[\s"'<>`]/.test(imgVal);
  if(imgVal && !imgOk){ showToast('Image link must be a plain http:// or https:// address'); return; }
  const nameKey = UMCore.productNameKey(ck.name);
  if(_addProdInFlight.has(nameKey)){ showToast('Still waiting for the cloud to answer about this product — it may already be saved'); return; }
  // asked first (a second tap saves): no category, a name that says a product already in the catalog another way
  if(ck.asks.length && _addProdAsked !== sig){
    _addProdAsked = sig;
    const box = document.getElementById('apAsk');
    if(box) box.innerHTML = `<div class="ap-ask">${ck.asks.map(a => a.kind === 'lookalike'
      ? `<p>${esc(`Looks like a product already in the catalog: ${a.products.map(n => '“' + n + '”').join(', ')}. Tap Save again to add it as a new product.`)}</p>`
      : `<p>${esc('No category: this product will be in no selling guide and not in a clinic’s sell guide. Tap Save again to add it without one.')}</p>`).join('')}</div>`;
    if(box && box.scrollIntoView) try{ box.scrollIntoView({ block: 'nearest' }); }catch(e){} // (the Save button sits in the sheet's foot: the question shows beside it)
    return;
  }
  const prod = { id: ck.code || uid(), name: ck.name, brand: ck.brand, price: ck.price };
  if(ck.cat) prod.cat = ck.cat;
  if(ck.barcode) prod.barcode = String(draft.barcode).replace(/[\s-]+/g, '');
  if(imgOk) prod.img = imgVal;
  products.push(prod);
  assignProductKeys();
  const btn = document.getElementById('apSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  _addProdInFlight.add(nameKey);
  // a save with no answer in time may still land: then the product comes back on the screen (onLate)
  const late = () => {
    _addProdInFlight.delete(nameKey);
    if(!products.some(p => p && p.id === prod.id && p.name === prod.name)){ products.push(prod); assignProductKeys(); }
    _gapMemo = { k: null, v: [] };
    if(document.getElementById('productListWrap')) renderProducts();
    if(document.getElementById('apSave')) closeModal();
  };
  const r = await persistTold('products', { onLate: late });
  if(!r.ok){
    // not saved: the catalog on screen is the cloud's again; the sheet keeps what was typed
    products = products.filter(p => p !== prod); assignProductKeys();
    if(!(r.outcome && (r.outcome.timeout || r.outcome.awaitingSignIn))) _addProdInFlight.delete(nameKey); // (no answer yet: it may still land)
    if(btn){ btn.disabled = false; btn.textContent = 'Save product'; }
    saveToast(r, 'products', '');
    return;
  }
  _addProdInFlight.delete(nameKey);
  _gapMemo = { k: null, v: [] };
  closeModal();
  openBrands.add(prod.brand);
  if(document.getElementById('productListWrap')) renderProducts();
  saveToast(r, 'products', 'Product added'); // "added" only when it landed
}


// ---- MISSING FROM THE CATALOG (supervisor) ----
// Products the team sells (ERP files) or should carry (the Intensiv list) that
// the catalog does not have yet: shown on the Products screen, added only
// when the supervisor ticks them and taps Add.
let _gapMemo = { k: null, v: [] };
function catalogGapList(){
  const periods = UMCore.erpPeriodsOf(erpSales);
  const k = products.length + '|' + products.map(p => p.id).join(',').length + '|' + periods.map(p => p.id + ':' + (p.rows || []).length).join(',');
  if(_gapMemo.k === k) return _gapMemo.v;
  const rows = []; periods.forEach(p => UMCore.unpackErpRows(p.rows).forEach(r => rows.push(r)));
  _gapMemo = { k, v: UMCore.catalogGaps(products, rows, typeof INTENSIV_PRODUCTS !== 'undefined' ? INTENSIV_PRODUCTS : []) };
  return _gapMemo.v;
}
function catalogGapNote(){
  if(!currentUser || currentUser.role !== 'supervisor') return '';
  let g; try{ g = catalogGapList(); }catch(e){ console.error('catalog gaps', e); return ''; }
  if(!g.length) return '';
  const byB = {}; g.forEach(x => { byB[x.product.brand] = (byB[x.product.brand] || 0) + 1; });
  return `<div class="card clickable" style="margin-bottom:10px; border:1.5px solid var(--amber);" onclick="openCatalogGaps()">
    <div style="font-weight:800; font-size:13.5px;">${g.length} product${g.length === 1 ? '' : 's'} missing from the catalog</div>
    <div style="font-size:12px; color:var(--muted); margin-top:2px;">${Object.keys(byB).map(b => esc(b) + ' (' + byB[b] + ')').join(' · ')} — tap to review and add</div></div>`;
}
function openCatalogGaps(){
  if(!requireAdmin()) return;
  const g = catalogGapList();
  if(!g.length){ showToast('Nothing missing from the catalog'); return; }
  const byB = Object.create(null); g.forEach((x, i) => { (byB[x.product.brand] = byB[x.product.brand] || []).push(i); });
  showModal(`
    <h3 style="margin-top:0;">Missing from the catalog</h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-6px;">Products sold in the ERP sales files under a brand the catalog has nothing of, and the Intensiv handpieces and Ortho-Strips. Price = the usual invoiced unit price. Untick anything you do not want, then tap Add.</p>
    ${Object.keys(byB).map(b => `<div class="card" style="margin-bottom:8px; padding:8px 12px;">
      <label style="display:flex; align-items:center; gap:8px; font-weight:800; margin:0;"><input type="checkbox" checked onchange="document.querySelectorAll('.cgap-${jsArg(slugify(b))}').forEach(x => x.checked = this.checked)"> ${esc(b)} <span style="color:var(--muted); font-weight:400;">(${byB[b].length})</span></label>
      ${byB[b].map(i => { const x = g[i], p = x.product; return `<label style="display:flex; align-items:flex-start; gap:8px; font-size:12.5px; margin:7px 0 0; font-weight:400;">
        <input type="checkbox" class="cgap cgap-${slugify(b)}" data-i="${i}" checked style="margin-top:3px;">
        <span style="flex:1;">${esc(p.name)}<br><span style="color:var(--muted); font-size:11.5px;">${p.cat && p.cat !== p.brand ? esc(p.cat) + ' · ' : ''}${x.sold ? x.sold + ' sold in the files' + (x.last ? ', last ' + fmtDate(x.last) : '') : x.source === 'list' ? 'Intensiv list' : ''}</span></span>
        <b style="white-space:nowrap;">${p.price != null ? money(Number(p.price)) : '—'}</b></label>`; }).join('')}
    </div>`).join('')}
    <div style="display:flex; gap:8px; margin-top:12px;">
      <button class="btn" id="cgapAdd" onclick="addCatalogGaps()">Add selected</button>
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
    </div>`);
}
async function addCatalogGaps(){
  if(!requireAdmin()) return;
  const g = catalogGapList();
  const pick = [...document.querySelectorAll('.cgap')].filter(x => x.checked).map(x => g[+x.dataset.i]).filter(Boolean);
  if(!pick.length){ showToast('Tick at least one product'); return; }
  const btn = document.getElementById('cgapAdd'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const ids = new Set(products.map(p => String(p.id)));
  const added = pick.map(x => { const p = Object.assign({}, x.product); if(p.id == null || ids.has(String(p.id))) p.id = uid(); ids.add(String(p.id)); return p; });
  products.push(...added);
  assignProductKeys();
  const told = await persistTold('products'), ok = told.ok;
  if(ok === false){
    const gone = new Set(added);
    products = products.filter(p => !gone.has(p)); assignProductKeys();
    if(btn){ btn.disabled = false; btn.textContent = 'Add selected'; }
    const o = told.outcome || {};
    if(o.denied || o.tooLarge) saveToast(told, 'products', ''); // refused or too large: a connection would not help
    else showToast('⚠️ Not saved — nothing was added. Try again with a connection.');
    return;
  }
  _gapMemo = { k: null, v: [] };
  closeModal();
  added.forEach(p => openBrands.add(p.brand));
  if(document.getElementById('productListWrap')) renderProducts();
  showToast(`✅ ${added.length} product${added.length === 1 ? '' : 's'} added to the catalog`);
}

// ---- DUPLICATE SKUs / BARCODES (supervisor, review only) ----
// The owner's request (v121): products that share an item code or a barcode
// are listed for review, never merged or deleted automatically. Each opens
// its own product page, where the supervisor corrects it by hand; the report
// copies to paste into a sheet (UMCore.productDuplicates / …Report).
let _dupMemo = { k: null, v: null };
function productDupList(){
  const k = products.length + '|' + products.map(p => p ? [p.id, p.barcode, p.name, p.brand, p.price, p._key].join('/') : '').join('\n');
  if(_dupMemo.k !== k) _dupMemo = { k, v: UMCore.productDuplicates(products) };
  return _dupMemo.v;
}
function productDupNote(){
  if(!currentUser || currentUser.role !== 'supervisor') return '';
  let d; try{ d = productDupList(); }catch(e){ console.error('product duplicates', e); return ''; }
  if(!d.sku.length && !d.barcode.length) return '';
  return `<div class="card clickable" id="dupNote" style="margin-bottom:10px; border:1.5px solid var(--amber);" onclick="openProductDups()">
    <div style="font-weight:800; font-size:13.5px;">Duplicate SKUs / barcodes</div>
    <div style="font-size:12px; color:var(--muted); margin-top:2px;">${d.products} products share an item code or a barcode — tap to review</div></div>`;
}
function openProductDups(){
  if(!requireAdmin()) return;
  const d = productDupList();
  const group = g => `<div class="card" style="margin-bottom:8px; padding:8px 12px;">
      <div style="font-weight:800; font-size:13px;"><span dir="ltr" data-notr>${esc(g.value)}</span> <span style="color:var(--muted); font-weight:400;" data-notr>×${g.items.length}</span></div>
      ${g.items.map(x => `<div class="row-between" style="padding:6px 0; border-top:1px solid var(--line); cursor:pointer; gap:8px;" data-key="${esc(x.key)}" onclick="openDupProduct(this.dataset.key)">
        <span style="flex:1; font-size:12.5px;" data-notr>${esc(x.name)}<br><span style="color:var(--muted); font-size:11.5px;">${esc(x.brand)}${g.kind === 'sku' ? (x.barcode ? ' · ' + esc(x.barcode) : '') : (x.id ? ' · ' + esc(x.id) : '')}</span></span>
        <b style="white-space:nowrap; font-size:12.5px;" data-notr>${x.price != null ? money(x.price) : '—'}</b></div>`).join('')}
    </div>`;
  const section = (title, list) => list.length ? `<div class="section-title" style="margin-top:6px;"><span>${title}</span> <span data-notr>(${list.length})</span></div>${list.map(group).join('')}` : '';
  showModal(`
    <h3 style="margin-top:0;">Duplicate SKUs / barcodes</h3>
    <p style="color:var(--muted); font-size:12.5px; margin-top:-6px;">Products that share an item code or a barcode. Check each one and correct it on its own page (Edit) — nothing is merged or deleted here.</p>
    ${d.sku.length || d.barcode.length ? '' : '<div class="empty">No two products share an item code or a barcode.</div>'}
    ${section('Same item code (SKU)', d.sku)}
    ${section('Same barcode', d.barcode)}
    <textarea class="export-textarea" id="dupReportText" readonly style="display:none;"></textarea>
    <div style="display:flex; gap:8px; margin-top:12px;">
      <button class="btn" onclick="copyProductDupReport()">Copy the report</button>
      <button class="btn secondary" onclick="closeModal()">Close</button>
    </div>`);
}
function openDupProduct(key){ closeModal(); openProductDetail(key); }
function copyProductDupReport(){
  const el = document.getElementById('dupReportText'); if(!el) return;
  el.value = UMCore.productDuplicatesReport(productDupList());
  el.style.display = 'block'; el.focus(); el.select();
  let ok = false; try{ ok = document.execCommand('copy'); }catch(e){ ok = false; }
  showToast(ok ? 'Report copied — paste it into a sheet' : 'Select the report above and copy it');
}

// ---- PLAYBOOK ----
// Visual guidance: every product suggestion carries its PHOTO. ERP product
// names differ slightly from catalog names, so match by token overlap; when
// no photo exists (e.g. professional Univet gear) show a branded tile.
// a product's name and brand as tokens, kept beside it and worked out again when either changes (v126 speed)
const _findCatToks = new WeakMap();
function findCatalogProduct(name){
  const nt = String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
  if(!nt.length) return null;
  let best = null, bestScore = 0;
  products.forEach(pr => {
    const obj = pr && typeof pr === 'object', e = obj ? _findCatToks.get(pr) : null;
    const pt = e && e.n === pr.name && e.b === pr.brand ? e.t : (() => { const t = (pr.name+' '+(pr.brand||'')).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/); if(obj) _findCatToks.set(pr, { n: pr.name, b: pr.brand, t }); return t; })();
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
  if(typeof syncNav === 'function') syncNav();   // the sidebar marks the Doctors entry of the open tab
  const q = ((document.getElementById('ddSearch')||{}).value||'').trim().toLowerCase();
  const repFilter = currentUser.role==='supervisor' ? 'all' : currentUser.name;
  const docs = UMCore.doctorAnalytics({clinics: ddPool(), visits, today: todayStr(), repFilter});
  const filtersEl = document.getElementById('ddFilters');
  if(ddTab === 'rx'){ filtersEl.innerHTML=''; renderRxStats(body, docs); return; }
  const dueN = docs.filter(d=>d.cadenceStatus==='due').length;
  const bdayN = docs.filter(d=>d.birthdayIn!=null && d.birthdayIn<=14).length;
  const clinicOf = new Map(); clinics.forEach(c => { if(c && !clinicOf.has(c.id)) clinicOf.set(c.id, c); }); // (the first clinic with each id, as find() gives — once for the list)
  const rawOf = d => ((clinicOf.get(d.clinicId)||{}).doctors||[]).find(x=>x.id===d.id) || {};
  const incN = docs.filter(d=>UMCore.doctorRecordCompleteness(rawOf(d)).pct<100).length;
  filtersEl.innerHTML = [
    ['all', `All (${docs.length})`], ['due', `${I('bell')} Follow-up due (${dueN})`],
    ['bday', `${I('cake')} Birthdays soon (${bdayN})`], ['rx', `${I('pill')} On prescriptions`],
    ['incomplete', `${I('pencil')} Incomplete cards (${incN})`],
  ].map(([k,l])=>`<div class="chip small ${ddFilter===k?'on':''}" onclick="ddFilter='${jsArg(k)}'; renderDoctorsDb();">${l}</div>`).join('');
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
  const dg = dataGaps(), gaps = dg.length; // (once for both figures)
  const totalFields = docs.length*7 + ddPool().filter(c=>c.cls!=='Closed').length*3;
  const pctDone = totalFields ? Math.max(0, Math.round((1 - dg.reduce((s2,g)=>s2+g.miss.length,0)/totalFields)*100)) : 100;
  body.innerHTML = `
    <div class="dd-tools">
      ${currentUser.role==='supervisor'?`<button class="chip small" onclick="openContactImport()">${I('download')} Import contacts</button>`:''}
      <button class="chip small" onclick="openDoctorRecords()">${I('clipboard')} Doctor records</button>
      <button class="chip small" style="${gaps?'border-color:var(--gold); color:var(--amber-ink); font-weight:700;':''}" onclick="openDataEntry()">${I('pencil')} Complete data ${gaps?`(${gaps})`:'✓'}</button>
      <button class="chip small" onclick="exportDoctorsDbXlsx()">${I('share')} Export (Excel)</button>
      <span class="chip small dd-pct" style="pointer-events:none;">Data completeness: ${pctDone}%</span>
    </div>
    ` + (list.length ? `<div class="lrows dd-rows">` : '') + (pagedRows('dd', [ddFilter, q, currentUser.name, currentUser.role].join('\u0001'), list, d=>{ // (the first rows, then "Show more": v126 speed, part 4)
    const pb = SPECIALTY_PLAYBOOK[d.title];
    return `<div class="lrow dd-row clickable" role="button" tabindex="0" onclick="openDoctorProfile('${jsArg(d.clinicId)}','${jsArg(d.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">
      <span class="lr-ic" aria-hidden="true">${pb ? `<span class="dd-emo">${pb.icon}</span>` : I('stethoscope')}</span>
      <div class="row-between" style="flex:1; min-width:0; align-items:flex-start;">
        <div style="min-width:0;">
          <div class="clinic-name">${esc(d.name)}${d.title?` <span style="color:var(--muted); font-size:11.5px; font-weight:400;">${esc(d.title)}</span>`:''}</div>
          ${docBadges(rawOf(d))}
          <div class="clinic-sub">${esc(d.clinicName)}${currentUser.role==='supervisor'?' · '+esc(d.rep):''} · ${d.fieldVisits} visit${d.fieldVisits===1?'':'s'}${d.calls?` · ${d.calls} call${d.calls===1?'':'s'}`:''}${d.lastVisit?` · last ${fmtDate(d.lastVisit)}`:' · never visited'}</div>
        </div>
        <div style="text-align:start; flex-shrink:0; display:flex; flex-direction:column; gap:3px; align-items:flex-end;">
          ${d.cadenceStatus==='due'?`<span class="badge overdue">${I('bell')} ${d.overdueDays}d late</span>`:d.cadence?`<span class="badge upcoming">✓ ${esc(d.cadence)}</span>`:''}
          ${d.birthdayIn!=null && d.birthdayIn<=14?`<span class="badge today">${I('cake')} ${d.birthdayIn===0?'TODAY':'in '+d.birthdayIn+'d'}</span>`:''}
          ${d.handovers.rxMonth?`<span style="font-size:10.5px; color:var(--teal); font-weight:700;">💊 ${rxPadsText(d.handovers.rxMonth)} this month</span>`:''}
        </div>
      </div>
    </div>`;
  }) + (list.length ? `</div>` : '') || '<div class="empty">👨‍⚕️ No doctors match. Doctors are added from each clinic\'s file or while logging a visit.</div>');
}
// ---- PRESCRIPTIONS GIVEN: the Doctors page tab (v114) ----
// Pads of printed prescription forms, counted from the one ledger
// (UMCore.rxGrowth over rxLedger): the visits' lines plus the older entries
// on doctor profiles, for the clinics in view (the current owner's), whoever
// handed them over. This week and this month are each compared with the same
// days before; a window whose visits did not all load shows "—".
function rxGrowthNow(){
  const repFilter = currentUser.role==='supervisor' ? 'all' : currentUser.name;
  return UMCore.rxGrowth({ clinics: ddPool(), visits, today: todayStr(), repFilter, types: rxTypes(), brokenMonths: _visitsBroken });
}
// ▲/▼ x%; "from zero" when nothing was given the same days before and
// something now; "—" when nothing either side or a window is incomplete.
function rxGrowthTag(growth, cur, prev, incomplete){
  const muted = t => `<span style="font-weight:700; color:var(--muted);">${t}</span>`;
  if(incomplete) return muted('—');
  if(growth == null) return prev === 0 && cur > 0 ? '<span style="font-weight:800; color:var(--sage-ink);">from zero</span>' : muted('—');
  return `<span style="font-weight:800; color:${growth>0?'var(--sage-ink)':growth<0?'var(--coral-ink)':'var(--muted)'};">${growth>0?'▲':growth<0?'▼':'•'} ${Math.abs(growth)}%</span>`;
}
function renderRxStats(body){
  if(!rxReady() || typeof UMCore.rxGrowth !== 'function'){ body.innerHTML = `<div class="empty">${RX_STALE_MSG}</div>`; return; }
  const sup = currentUser.role === 'supervisor';
  const g = rxGrowthNow(), T = g.totals, inc = T.incomplete || {};
  const fig = (n, incomplete) => incomplete ? '—' : n;
  const tile = (key, label, cur, curInc, prevLabel, prev, prevInc, growth) => `
    <div class="rx-tile">
      <div class="rt-l">${label}</div>
      <div class="rt-n" data-rx-total="${key}">${fig(cur, curInc)}</div>
      ${prevLabel ? `<div class="rt-p">${prevLabel}: ${fig(prev, prevInc)}</div>
      <div class="rt-g">${rxGrowthTag(growth, cur, prev, curInc || prevInc)}</div>`
      : (inc.total ? '<div class="rt-p" style="color:var(--amber-ink);">incomplete</div>' : '')}
    </div>`;
  // the three figures of a doctor or a center, each label its own text (translated)
  const figLine = x => `<div style="display:flex; flex-wrap:wrap; gap:2px 12px; font-size:12px; color:var(--muted); margin-top:3px;">
      <span><span>This week</span> <b style="color:var(--ink);">${fig(x.week, inc.week)}</b> ${rxGrowthTag(x.weekGrowth, x.week, x.prevWeek, inc.week || inc.prevWeek)}</span>
      <span><span>This month</span> <b style="color:var(--ink);">${fig(x.month, inc.month)}</b> ${rxGrowthTag(x.monthGrowth, x.month, x.prevMonth, inc.month || inc.prevMonth)}</span>
      <span><span>All time</span> <b style="color:var(--ink);">${x.total}</b></span>
    </div>`;
  const rowStyle = 'padding:8px 0; border-bottom:1px solid var(--line);';
  const typeGrid = 'display:grid; grid-template-columns:minmax(0,1fr) 54px 54px 54px; gap:4px; align-items:center;';
  const typeRow = t => {
    const key = t.type == null ? '_profile' : t.type;
    const name = t.type == null ? '<span>Type not recorded (doctor profile)</span>' : `<span dir="auto">${esc(t.name)}</span>`;
    return `<div class="rx-trow" data-rx-bytype="${esc(key)}" style="${typeGrid} ${rowStyle} font-size:13px;">
      <div style="min-width:0; overflow-wrap:anywhere;">${name}${t.active === false ? ' <span style="color:var(--muted); font-size:11px;">(retired)</span>' : ''}</div>
      <div style="text-align:center; font-weight:700;">${fig(t.week, inc.week)}</div>
      <div style="text-align:center; font-weight:700;">${fig(t.month, inc.month)}</div>
      <div style="text-align:center; font-weight:700;">${t.total}</div>
    </div>`;
  };
  const sections = !T.total ? '<div class="empty">No prescription pads logged yet — they are logged with the visit.</div>' : `
    <div class="section-title"><span>By type</span></div>
    <div class="card" style="padding:6px 12px;">
      <div style="${typeGrid} font-size:10.5px; color:var(--muted); font-weight:700; padding:4px 0 2px; text-align:center;"><div></div><div>This week</div><div>This month</div><div>All time</div></div>
      ${g.byType.map(typeRow).join('')}
    </div>
    <div class="section-title"><span>${I('stethoscope')} <span>By doctor</span></span></div>
    ${g.byDoctor.length ? `<div class="card" style="padding:4px 12px;">${g.byDoctor.map(d => `
      <div class="rx-row" data-rx-doctor="${esc(d.clinicId + '|' + d.doctorId)}" style="${rowStyle}">
        <div style="font-size:13.5px; font-weight:700; overflow-wrap:anywhere;"><span dir="auto">${esc(d.name)}</span> <span dir="auto" style="color:var(--muted); font-size:11px; font-weight:400;">${esc(d.clinicName)}</span></div>
        ${figLine(d)}
      </div>`).join('')}</div>` : '<div class="empty" style="padding:14px;">No pads given to a named doctor yet.</div>'}
    <div class="section-title"><span>${I('building')} <span>By center</span></span></div>
    <div class="card" style="padding:4px 12px;">${g.byClinic.map(c => `
      <div class="rx-row" data-rx-center="${esc(c.clinicId)}" style="${rowStyle}">
        <div style="font-size:13.5px; font-weight:700; overflow-wrap:anywhere;"><span dir="auto">${esc(c.name)}</span> <span style="color:var(--muted); font-size:11px; font-weight:400;">${c.doctors} doctor${c.doctors===1?'':'s'}</span>${sup && c.rep ? ` <span dir="auto" style="color:var(--muted); font-size:11px; font-weight:400;">· ${esc(c.rep)}</span>` : ''}</div>
        ${figLine(c)}
        ${c.unnamed ? `<div style="font-size:11.5px; color:var(--muted); margin-top:2px;">incl. ${rxPadsText(c.unnamed)} left at the clinic</div>` : ''}
        ${c.unlisted ? `<div style="font-size:11.5px; color:var(--muted); margin-top:2px;">incl. ${rxPadsText(c.unlisted)} to a doctor no longer listed</div>` : ''}
      </div>`).join('')}</div>
    <button class="chip small" style="margin-top:10px;" onclick="exportRxXlsx()">${I('share')} Export prescriptions (Excel)</button>`;
  body.innerHTML = `
    <div class="card rx-head" style="margin-bottom:10px;">
      <div class="row-between" style="margin-bottom:12px; flex-wrap:wrap;">
        <div class="sec-h"><span class="sec-ic" aria-hidden="true">${I('pill')}</span><span>Prescription pads given</span></div>
        ${sup ? `<button class="chip small" id="rxTypesBtn" onclick="openRxTypes()">Prescription types</button>` : ''}
      </div>
      <div class="rx-tiles">
        ${tile('week', 'This week', T.week, inc.week, 'Same days last week', T.prevWeek, inc.prevWeek, T.weekGrowth)}
        ${tile('month', 'This month', T.month, inc.month, 'Same days last month', T.prevMonth, inc.prevMonth, T.monthGrowth)}
        ${tile('all', 'All time', T.total, false, null)}
      </div>
      <div style="color:var(--muted); font-size:11px; margin-top:8px; line-height:1.45;">Week = Sunday to today, against the same days of last week. Month = day 1 to today, against the same days of last month.</div>
      <div style="color:var(--muted); font-size:11px; margin-top:4px; line-height:1.45;">Counted in pads from the visits, plus older entries on doctor profiles — for the doctors of these clinics, whoever handed them over.</div>
      ${_visitsBroken.length ? `<div id="rxIncomplete" style="margin-top:8px; padding:8px 10px; border-radius:10px; background:var(--amber-dim); color:var(--amber-ink); font-size:12px; line-height:1.45;">⚠️ Visits of ${esc(_visitsBroken.join(', '))} did not load — figures that include them are incomplete.</div>` : ''}
    </div>
    ${sections}`;
}
// ---- CONTACTS BULK IMPORT: one sheet in, everything filed automatically ----
let _contactImport = null;
function openContactImport(){
  if(!requireAdmin()) return;
  showModal(`
    <h3 style="margin-top:0;" data-ic="download">📥 Import all contacts at once</h3>
    <div style="color:var(--muted); font-size:12.5px; line-height:1.6; margin-bottom:10px;">
      Excel or CSV with columns such as: <b>doctor name, clinic, phone, specialty, birthday, notes</b>
      (Arabic or English — any order). The app files each doctor under their clinic by itself, creates the new clinics, updates the people already there instead of duplicating them, and converts specialties and dates by itself.</div>
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
    if(wb.error){ prev.innerHTML = '<div class="nudge">⚠️ The columns were not recognised — make sure one of the first rows has headers such as "Doctor name" or "Hygienist", "Clinic" and "Phone".</div>'; return; }
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
      <div style="color:var(--muted); font-size:12px; margin-bottom:6px;">Read ${readSheets.length} sheets: ${readSheets.map(s=>esc(s.sheet)+' ('+s.contacts+')').join(' · ')}${wb.duplicates?` — ${wb.duplicates} duplicates merged`:''}</div>
      <div class="card" style="padding:10px 12px;">
        <div class="spec-row"><span class="k">👥 Unique contacts</span><span class="v">${plan.length}</span></div>
        <div class="spec-row"><span class="k">➕ New people for clinics on the list</span><span class="v">${counts.add}</span></div>
        <div class="spec-row"><span class="k">🔄 People already there, updated (no duplicates)</span><span class="v">${counts.update}</span></div>
        <div class="spec-row"><span class="k">🏥 New clinics to be created</span><span class="v">${newList.length}</span></div>
        ${counts.noClinic?`<div class="spec-row"><span class="k">⚠️ No clinic name</span><span class="v">${counts.noClinic}</span></div>`:''}
      </div>
      ${newList.length?`<div style="font-size:12.5px; margin-top:8px;"><b>New clinics:</b> ${newList.map(x=>esc(x.name)+' ('+x.n+(x.rep?' · '+esc(x.rep):'')+')').join(' · ')}</div>
      <label style="margin-top:8px;">Rep for the new clinics whose rep the file does not name</label>
      <div class="chip-row" id="ciRep2">${REPS.map((r,i)=>`<div class="chip ${i===0?'on':''}" data-rep="${esc(r)}" onclick="pickModalRep(this)">${esc(r)}</div>`).join('')}</div>`:''}
      ${noClinic.length?`<div style="font-size:12.5px; margin-top:8px;"><b>No clinic in the file:</b> ${noClinic.map(x=>esc(x.ct.name)).join(uiLang === 'ar' ? '، ' : ', ')}</div>
      <label style="display:flex; gap:8px; align-items:center; margin-top:6px; font-size:12.5px;"><input type="checkbox" id="ciHold" style="width:auto;"> Add them to a holding clinic, «Contacts without a clinic», to move them later</label>`:''}
      <div style="max-height:220px; overflow:auto; margin-top:8px; font-size:12px;">
        ${plan.map(x=>`<div style="padding:3px 0; border-bottom:1px dashed var(--line);">
          ${icon(x.action.type)} <b>${esc(x.ct.name)}</b>${x.ct.title?` · ${esc(x.ct.title)}`:''}
          → ${x.action.type==='newClinic'?esc(x.action.clinicName)+(uiLang === 'ar' ? ' (جديدة)' : ' (new)'):x.action.clinic?esc(x.action.clinic.name):'—'}
          ${x.ct.area?` · 📍${esc(x.ct.area)}`:''}${x.ct.phone?' · 📞':''}${x.ct.birthday?' · 🎂':''}</div>`).join('')}
      </div>
      <div id="ciAsk2"></div>
      <button class="btn" style="margin-top:10px;" onclick="commitContactImport()">✅ Confirm the import</button>`;
  }catch(e){ console.error(e); prev.innerHTML = '<div class="nudge">⚠️ The file could not be read — try saving it as CSV.</div>'; }
}
async function commitContactImport(confirmed){
  if(!requireAdmin() || !_contactImport) return;
  const repEl = document.querySelector('#ciRep2 .chip.on');
  const newRep = repEl ? repEl.dataset.rep : (REPS[0]||'');
  const hold = !!(document.getElementById('ciHold') && document.getElementById('ciHold').checked);
  const HOLD_NAME = 'Contacts without a clinic';
  const newClinics = {}; // key -> clinic obj (created once, shared by its people)
  let added = 0, updated = 0, skippedN = 0, clinicsMade = 0;
  // the clinics it makes, first on their own (round 3): the "+ Add clinic" sales check reads them
  // before any is on the list, and the supervisor sees every account whose invoices would move
  let holdNew = null;
  _contactImport.plan.forEach(({action})=>{
    if(action.type==='newClinic' && !newClinics[action.key]) newClinics[action.key] = normalizeClinic({id:uid(), name: action.clinicName, rep: action.rep || newRep, cls:'B', notes: action.area ? 'Area: '+action.area : '', addedOn:todayStr()});
    if(action.type==='noClinic' && hold && !holdNew && !clinics.find(x=>x.name===HOLD_NAME)) holdNew = normalizeClinic({id:uid(), name:HOLD_NAME, rep:newRep, cls:'D', notes:'People imported without a clinic name — move each to their clinic.', addedOn:todayStr()});
  });
  const making = Object.values(newClinics).concat(holdNew ? [holdNew] : []);
  const ask = document.getElementById('ciAsk2');
  const chk = bulkClinicSalesCheck(making, typeof confirmed === 'string' ? confirmed : '', 'commitContactImport', "document.getElementById('ciAsk2').innerHTML=''",
    'To keep those sales where they count now, add those clinics first (Clinics → + Add clinic asks "Count from this month"), then import this file again.');
  if(!chk.ok){ if(ask) ask.innerHTML = newClinicAskCard(chk.html); else showToast('⚠️ Not saved — these clinic names need a check first', 6000); return; }
  making.forEach(c => { clinics.push(c); clinicsMade++; });
  const holdClinic = () => clinics.find(x=>x.name===HOLD_NAME);
  _contactImport.plan.forEach(({ct, action})=>{
    let clinic = action.clinic;
    if(action.type==='noClinic'){ if(!hold){ skippedN++; return; } clinic = holdClinic(); }
    if(action.type==='newClinic') clinic = newClinics[action.key];
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
  const r = await persistTold('clinics');
  closeModal();
  renderAll();
  if(document.getElementById('ddBody')) renderDoctorsDb();
  saveToast(r, 'clinics', `✅ ${added} new contacts · ${updated} updated${clinicsMade?` · ${clinicsMade} new clinics`:''}${skippedN?` · ${skippedN} without a clinic (not imported)`:''}`);
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
  if(!_deQueue.length){ showModal(`<h3 style="margin-top:0;">🏆 The data is complete!</h3><p style="color:var(--muted); font-size:13px;">Every clinic and doctor on your list has complete data.</p><button class="btn" onclick="closeModal()">Great</button>`); return; }
  renderDataEntryStep();
}
function renderDataEntryStep(){
  if(_dePos >= _deQueue.length){
    showModal(`<h3 style="margin-top:0;">🎉 All done!</h3><p style="color:var(--muted); font-size:13px;">You have completed all the missing data on your list.</p><button class="btn" onclick="closeModal(); renderDoctorsDb && renderDoctorsDb();">Done</button>`);
    return;
  }
  const it = _deQueue[_dePos];
  const prog = `<div style="height:5px; background:var(--paper); border-radius:3px; overflow:hidden; margin-bottom:10px;"><div style="width:${Math.round(_dePos/_deQueue.length*100)}%; height:100%; background:var(--teal);"></div></div>
    <div style="color:var(--muted); font-size:11px; margin-bottom:8px;">${_dePos+1} of ${_deQueue.length}</div>`;
  if(it.kind==='clinic'){
    showModal(`${prog}
      <h3 style="margin-top:0;" data-sections data-ic="building">🏥 ${esc(it.c.name)}</h3>
      ${it.miss.includes('phone')?`<label>📞 Clinic phone</label><input type="text" id="deClinicPhone" placeholder="2XXXXXXX">`:''}
      ${it.miss.includes('contact')?`<label style="margin-top:6px;">📇 Contact person (reception / manager)</label><input type="text" id="deClinicContact" placeholder="e.g. Reception — Ms. Huda">`:''}
      ${it.miss.includes('dealType')?`<label style="margin-top:6px;">🤝 How the clinic works with us</label>
        <div class="chip-row" id="deDeal"><div class="chip" data-v="prescription" data-deal="prescription" onclick="pickModalMulti(this)">💊 Prescription</div><div class="chip" data-v="direct" data-deal="direct" onclick="pickModalMulti(this)">🛒 Direct sales</div></div>`:''}
      <button class="btn" style="margin-top:12px;" onclick="saveDataEntryStep()">Save &amp; next →</button>
      <button class="btn secondary" style="margin-top:8px;" onclick="_dePos++; renderDataEntryStep();">Skip</button>`);
  } else {
    showModal(`${prog}
      <h3 style="margin-top:0;" data-sections data-ic="stethoscope">👨‍⚕️ ${esc(it.d.name)} <span style="color:var(--muted); font-size:12px; font-weight:400;">${esc(it.c.name)}</span></h3>
      ${it.miss.includes('title')?`<label>Specialty</label><div class="chip-row" id="deTitle">${SPECIALTIES.map(t=>`<div class="chip small" data-v="${esc(t)}" onclick="pickModalCls(this)">${SPECIALTY_PLAYBOOK[t].icon} ${esc(t)}</div>`).join('')}</div>`:''}
      ${it.miss.includes('phone')?`<label style="margin-top:6px;">📞 His phone</label><input type="text" id="deDocPhone" placeholder="9XXXXXXX">`:''}
      ${it.miss.includes('birthday')?`<label style="margin-top:6px;">🎂 His birthday</label><input type="date" id="deDocBday">`:''}
      ${it.miss.includes('role')?`<label style="margin-top:6px;">🏷️ His role in the clinic</label><div class="chip-row" id="deRole">${UMCore.DOC_ROLES.map(([k,l])=>`<div class="chip small" data-v="${k}" onclick="pickModalCls(this)">${esc(l)}</div>`).join('')}</div>`:''}
      ${it.miss.includes('influence')?`<label style="margin-top:6px;">👑 His buying influence</label><div class="chip-row" id="deInfl">${UMCore.DOC_INFLUENCE.map(([k,l])=>`<div class="chip small" data-v="${k}" onclick="pickModalCls(this)">${esc(l)}</div>`).join('')}</div>`:''}
      ${it.miss.includes('stage')?`<label style="margin-top:6px;">🤝 Relationship stage</label><div class="chip-row" id="deStage">${UMCore.DOC_STAGES.map(([k,l])=>`<div class="chip small" data-v="${k}" onclick="pickModalCls(this)">${esc(l)}</div>`).join('')}</div>`:''}
      ${it.miss.includes('cadence')?`<label style="margin-top:6px;">📆 His visit rhythm</label>
        <div class="chip-row" id="deCad"><div class="chip small" data-v="weekly" onclick="pickModalCls(this)">Weekly</div><div class="chip small" data-v="monthly" onclick="pickModalCls(this)">Monthly</div><div class="chip small" data-v="quarterly" onclick="pickModalCls(this)">Quarterly</div></div>`:''}
      <button class="btn" style="margin-top:12px;" onclick="saveDataEntryStep()">Save &amp; next →</button>
      <button class="btn secondary" style="margin-top:8px;" onclick="_dePos++; renderDataEntryStep();">Skip</button>`);
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
  if(changed){ const r = await persistTold('clinics'); saveToast(r, 'clinics', ''); } // said only when it did not land
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
    <h3 style="margin-top:0;" data-sections>${I('clipboard')} Doctor records</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">One card per doctor: who they are, what they decide, where the relationship stands. The coach turns the cards into next steps for every clinic.</p>
    ${currentUser.role==='supervisor'?`<div class="chip-row" style="margin-bottom:8px;">${['all',...REPS].map(r=>`<div class="chip small ${_drRep===r?'on':''}" onclick="_drRep='${jsArg(r)}'; openDoctorRecords();">${r==='all'?'All':esc(r)}</div>`).join('')}</div>`:''}
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
      <div class="row-between clickable" onclick="_drOpenClinic = _drOpenClinic==='${jsArg(c.id)}' ? null : '${jsArg(c.id)}'; renderDrList();">
        <div><div class="clinic-name">${esc(c.name)}</div><div class="clinic-sub">${currentUser.role==='supervisor'?esc(c.rep||'')+' · ':''}${n} doctor${n===1?'':'s'}${n?` · ${pct}% complete`:''}</div></div>
        <span style="color:var(--muted);">${open?'▾':'›'}</span>
      </div>
      ${open?`<div style="margin-top:10px; border-top:1px solid var(--line); padding-top:8px;">
        ${(c.doctors||[]).map(d=>{ const comp=UMCore.doctorRecordCompleteness(d); const pb=SPECIALTY_PLAYBOOK[d.title];
          return `<div class="doc-row row-between clickable" onclick="_drBack='records'; openDoctorRecord('${jsArg(c.id)}','${jsArg(d.id)}')">
            <div><div class="dname">${pb?pb.icon+' ':''}${esc(d.name)}${d.title?` <span style="color:var(--muted); font-size:11.5px; font-weight:400;">${esc(d.title)}</span>`:''}</div>${docBadges(d)}</div>
            <span class="badge ${comp.pct===100?'upcoming':'overdue'}">${comp.pct===100?'✓ complete':comp.pct+'%'}</span>
          </div>`; }).join('') || '<div style="color:var(--muted); font-size:12.5px;">No doctors recorded yet.</div>'}
        <div style="display:flex; gap:6px; margin-top:8px;">
          <input type="text" id="drNew-${esc(c.id)}" dir="auto" placeholder="Doctor name" style="flex:1; margin:0;">
          <button class="chip small" onclick="addDoctorFromRecords('${jsArg(c.id)}')">+ Add</button>
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
  if(r.added){ const saved = await persistTold('clinics'); saveToast(saved, 'clinics', ''); } // said only when it did not land
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
    <h3 style="margin-top:0;" data-sections>${I('pencil')} Doctor card</h3>
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
    <button class="btn" onclick="saveDoctorRecord('${jsArg(clinicId)}','${jsArg(docId)}')">Save card</button>
    <button class="btn secondary" onclick="closeModal(); openDoctorProfile('${jsArg(clinicId)}','${jsArg(docId)}')">Open profile & history</button>
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
  const r = await persistTold('clinics');
  const comp = UMCore.doctorRecordCompleteness(d);
  saveToast(r, 'clinics', comp.pct===100 ? '✅ Card complete — the coach now knows who decides' : `💾 Saved · ${comp.pct}% complete`);
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
  return `<div class="section-title" style="margin-top:20px;">Decision map</div>
    <div class="card" style="padding:12px 14px; border-inline-start:4px solid var(--purple);">
      ${who('Decision maker', m.deciders)}${who('Influencers', m.influencers)}${who('Champions', m.champions)}${who('Blocked', m.blocked)}
      ${m.gaps.length?`<div style="margin-top:6px; font-size:12px; font-weight:700; color:var(--amber-ink);">Gaps in what we know</div>${m.gaps.map(g=>`<div style="font-size:12.5px; padding:2px 0;">• ${esc(g)}</div>`).join('')}`:''}
      ${m.steps.length?`<div style="margin-top:6px; font-size:12px; font-weight:700; color:var(--teal);">Next steps</div>${m.steps.map(x=>`<div style="font-size:12.5px; padding:2px 0;">→ ${esc(x)}</div>`).join('')}`:''}
      ${canViewClinic(c)?`<button class="chip small" style="margin-top:8px;" onclick="_drBack=null; openDoctorRecords('${jsArg(c.id)}')">${I('pencil')} Fill the doctor cards</button>`:''}
    </div>`;
}
// Today: a nudge while cards are incomplete or a clinic has no known decision maker.
function renderDocCardsNudge(){
  const el = document.getElementById('docCardsNudge'); if(!el) return;
  // a person's screen counts what her phone counts — her clinics and the unassigned ones (canViewClinic for her) —
  // so the supervisor's view of her shows her own numbers, not the team's
  const lr = typeof msListRep === 'function' ? msListRep() : null;
  const pool = clinics.filter(c=>(lr ? (!c.rep || c.rep===lr) : canViewClinic(c)) && c.cls!=='Closed');
  const docs = pool.flatMap(c=>c.doctors||[]);
  const inc = docs.filter(d=>UMCore.doctorRecordCompleteness(d).pct<100).length;
  const noDecider = pool.filter(c=>(c.doctors||[]).length && !(c.doctors||[]).some(d=>d.influence==='decider')).length;
  if(typeof _msNudge !== 'undefined') _msNudge.cards = inc;      // the folded Tasks card names it (msFoldSums)
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
  if(!d.role || !d.influence || !d.stage) acts.push('🧭 Complete the doctor card (his role in the clinic, buying influence, relationship stage) — then the right guidance for him shows here');
  const STAGE_STEP = {new:'👋 Not met yet — ask the reception for a short appointment to get acquainted', met:'🧪 A second visit within two weeks, with samples, to settle the relationship', warm:'🛒 The relationship is ready — ask for a trial order or a prescription', champion:'🤝 Ask him to introduce you to the decision maker or the other doctors, or to recommend you to another clinic', blocked:'🚧 Do not press him — work through someone else in the clinic (an influencer or a specialist)'};
  if(STAGE_STEP[d.stage]) acts.push(STAGE_STEP[d.stage]);
  if(d.influence==='decider' && da.lastVisit && daysBetween(da.lastVisit, todayStr())>=45) acts.push(`👑 The decision maker — not visited for ${daysBetween(da.lastVisit, todayStr())} days; put him in this week's plan`);
  if(d.influence==='decider' && !da.lastVisit) acts.push('👑 The decision maker, and no visit with him is logged — start with him');
  if(d.nextStep) acts.push('📌 Next step on record: ' + d.nextStep);
  if(da.cadenceStatus==='due') acts.push(`⏰ Visit due — ${da.overdueDays} days late on the "${da.cadence}" rhythm`);
  if(da.birthdayIn!=null && da.birthdayIn<=14) acts.push(`🎂 Birthday ${da.birthdayIn===0?'today!':'in '+da.birthdayIn+(da.birthdayIn===1?' day':' days')} — get a greeting or a fitting gift ready`);
  if(clinicIsRx(c) && da.handovers.rxMonth===0) acts.push('💊 No prescription pads this month — his clinic works by prescription');
  if(!da.cadence) acts.push('📆 Set a follow-up rhythm (weekly / monthly / quarterly) so the app follows him up by itself');
  const lastV = da.visitLog[0];
  if(lastV && lastV.noOrderReason) acts.push(`📝 The last visit had no order — reason: "${lastV.noOrderReason}" — deal with it on the next visit`);
  if(!acts.length) acts.push('✅ All in order — keep the current rhythm');
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
  // Labels of every kind ever logged here; NEW entries are samples, gifts and
  // other items only — prescription pads are logged with the visit (v114), so
  // the same pads can never be entered twice.
  const KINDS = {prescription:'💊 Prescription', sample:'🧪 Sample', gift:'🎁 Gift', other:'📦 Other'};
  const NEW_KINDS = Object.entries(KINDS).filter(([k]) => k !== 'prescription');
  // This doctor's pads from the visits (the one ledger), one entry per visit,
  // listed read-only next to the profile entries: edited on the visit itself.
  const rxVisitItems = [];
  if(rxReady()){
    const at = {};
    UMCore.rxLedger({ clinics: [c], visits }).filter(r => r.source === 'visit' && r.listed && r.doctorId === docId).forEach(r => {
      if(!at[r.visitId]){ at[r.visitId] = { date: r.date, visitId: r.visitId, rep: r.rep, withRep: r.withRep, items: [] }; rxVisitItems.push(at[r.visitId]); }
      at[r.visitId].items.push(r);
    });
  }
  const hoList = [...(d.handovers||[]).map(h => ({ date: String(h.date||''), h })), ...rxVisitItems.map(g => ({ date: g.date, g }))]
    .sort((a,b) => b.date.localeCompare(a.date));
  const pb = SPECIALTY_PLAYBOOK[d.title];
  showModal(`
    <div class="row-between dp-head" style="align-items:flex-start;" data-sections>
      <h3 style="margin:0;">${pb?pb.icon+' ':''}${esc(d.name)}</h3>
      <div style="display:flex; gap:4px;">${canEdit?`<button class="chip small" onclick="_drBack=null; openDoctorRecord('${jsArg(clinicId)}','${jsArg(docId)}')">${I('pencil')} Edit card</button>`:''}<button class="chip small" onclick="exportDoctorReportXlsx('${jsArg(clinicId)}','${jsArg(docId)}')">📄 Detailed report</button></div>
    </div>
    ${docBadges(d)}
    <p class="dp-sub" style="color:var(--muted); font-size:12.5px; margin:2px 0 10px;">${esc(d.title||'—')} · <a onclick="closeModal(); openClinicDetail('${jsArg(clinicId)}')" style="text-decoration:underline; cursor:pointer;">${esc(c.name)}</a>${currentUser.role==='supervisor'?' · '+esc(c.rep):''}${d.phone?` · <a href="tel:${esc(d.phone)}">📞 ${esc(d.phone)}</a>`:''}</p>

    <div class="section-title" style="margin-top:0;">🎯 What to do</div>
    <div class="card" style="border-inline-start:4px solid var(--teal);">${acts.map(a=>`<div style="font-size:12.5px; padding:3px 0;">${esc(a)}</div>`).join('')}</div>

    <div class="section-title">📊 Figures</div>
    <div class="card" style="padding:10px 12px;">
      <div class="spec-row"><span class="k">Field visits / calls</span><span class="v">${da.fieldVisits} / ${da.calls}${da.lastVisit?` · last visit ${fmtDate(da.lastVisit)}`:''}</span></div>
      <div class="spec-row"><span class="k">💊 Prescription pads (this month / total)</span><span class="v">${da.handovers.rxMonth} / ${da.handovers.prescription}</span></div>
      <div class="spec-row"><span class="k">🧪 Samples · 🎁 Gifts</span><span class="v">${da.handovers.sample} · ${da.handovers.gift}</span></div>
      <div class="spec-row"><span class="k">🏥 His clinic's sales this month (ERP)</span><span class="v">${money(clinicMtd.net||0)}</span></div>
      ${led.foc.length?`<div class="spec-row"><span class="k">Free goods / samples for his clinic (from the invoices)</span><span class="v">${led.foc.length} invoice lines</span></div>`:''}
    </div>

    ${canEdit?`<div class="section-title">👤 Profile</div>
    <div class="card" style="padding:12px;">
      <label>👨‍⚕️ Name (to correct it)</label>
      <div style="display:flex; gap:6px;">
        <input type="text" value="${esc(d.name||'')}" style="flex:1; margin:0;">
        <button class="chip small" onclick="saveDoctorField('${jsArg(clinicId)}','${jsArg(docId)}','name',this.previousElementSibling.value); openDoctorProfile('${jsArg(clinicId)}','${jsArg(docId)}');">💾 Save</button>
      </div>
      <label style="margin-top:8px;">🎂 Date of birth</label>
      <input type="date" value="${esc(d.birthday||'')}" onchange="saveDoctorField('${jsArg(clinicId)}','${jsArg(docId)}','birthday',this.value)">
      <label style="margin-top:8px;">📞 Phone</label>
      <input type="text" value="${esc(d.phone||'')}" placeholder="9XXXXXXX" onchange="saveDoctorField('${jsArg(clinicId)}','${jsArg(docId)}','phone',this.value)">
      <label style="margin-top:8px;">📆 Follow-up rhythm</label>
      <div class="chip-row">${[['weekly','Weekly'],['monthly','Monthly'],['quarterly','Quarterly'],['','None']].map(([k,l])=>`<div class="chip small ${(d.cadence||'')===k?'on':''}" onclick="saveDoctorField('${jsArg(clinicId)}','${jsArg(docId)}','cadence','${jsArg(k)}'); openDoctorProfile('${jsArg(clinicId)}','${jsArg(docId)}');">${l}</div>`).join('')}</div>
      <label style="margin-top:8px;">📝 About him (interests, personality, notes)</label>
      <textarea style="min-height:60px;" onchange="saveDoctorField('${jsArg(clinicId)}','${jsArg(docId)}','notes',this.value)">${esc(d.notes||'')}</textarea>
    </div>`:''}

    <div class="section-title">🎁 Handovers (${hoList.length})</div>
    ${canEdit?`<div class="card" style="padding:12px; margin-bottom:8px;">
      <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">${I('pill')} <span>Prescriptions are logged with the visit.</span></div>
      <div class="chip-row" id="hoKind">${NEW_KINDS.map(([k,l],i)=>`<div class="chip small ${i===0?'on':''}" data-kind="${k}" onclick="pickModalCls(this)">${l}</div>`).join('')}</div>
      <div style="display:flex; gap:6px; margin-top:8px;">
        <input type="text" id="hoWhat" placeholder="What was handed over?" style="flex:2;">
        <input type="number" id="hoQty" placeholder="Qty" min="1" value="1" style="flex:0.6;">
        <input type="date" id="hoDate" value="${todayStr()}" max="${todayStr()}" style="flex:1.1;">
      </div>
      <button class="btn small" style="margin-top:8px;" onclick="addHandover('${jsArg(clinicId)}','${jsArg(docId)}')">➕ Record the handover</button>
    </div>`:''}
    ${hoList.slice(0,15).map(({ h, g }) => g ? (() => {
      const vv = visits.find(x => x.id === g.visitId);
      return `<div class="visit-hist ho-visit" style="border-inline-start:3px solid var(--teal); padding-inline-start:10px;">
        <strong>${fmtDate(g.date)}</strong> · ${I('pill')} ${g.items.map(r => `<span dir="auto">${esc(rxTypeNameOf(r.type, r.name))} ×${r.qty}</span>`).join(', ')}
        <span style="color:var(--muted); font-size:11px;"> — <span dir="auto">${esc(g.rep)}${g.withRep ? ' 🤝 ' + esc(g.withRep) : ''}</span></span>
        <div style="font-size:11px; color:var(--muted); margin-top:3px; display:flex; align-items:center; gap:8px;"><span>from the visit — edit it there</span>${vv && canEditVisit(vv) ? `<button class="chip small" aria-label="Edit visit" onclick="openEditVisit('${jsArg(g.visitId)}')">${I('pencil')}</button>` : ''}</div>
      </div>`; })() : `
      <div class="visit-hist" style="border-inline-start:3px solid ${h.kind==='prescription'?'var(--teal)':h.kind==='gift'?'var(--gold)':'var(--sage)'}; padding-inline-start:10px;">
        <strong>${fmtDate(h.date)}</strong> · <span>${KINDS[h.kind]||esc(h.kind)}</span> · <span dir="auto">${esc(h.what||'')}${h.qty>1?` ×${h.qty}`:''}</span>
        <span style="color:var(--muted); font-size:11px;"> — ${esc(h.by||'')}</span>
        ${canEdit?`<button class="del" style="float:left;" onclick="removeHandover('${jsArg(clinicId)}','${jsArg(docId)}','${jsArg(h.id)}')">&times;</button>`:''}
      </div>`).join('') || '<div style="color:var(--muted); font-size:12.5px;">No handovers recorded yet.</div>'}

    <div class="section-title">🗓️ Visit log (${da.visitLog.length})</div>
    ${da.visitLog.slice(0,10).map(v=>`
      <div class="visit-hist"><strong>${fmtDate(v.date)}</strong> · ${esc(v.rep)}${v.callOnly?' · '+(CHANNEL_LABELS[v.channel]||'📞'):''}${v.orderTaken?' · 🛒 '+money(v.orderTotal):''}
      ${rxLinesHTML(v, c, { only: docId })}
      ${v.notes?`<div style="color:var(--muted); font-size:12px;">${esc(v.notes.slice(0,120))}</div>`:''}
      ${v.noOrderReason?`<div style="color:var(--coral-ink); font-size:11.5px;">No order: ${esc(v.noOrderReason.slice(0,80))}</div>`:''}</div>`).join('')
      || '<div style="color:var(--muted); font-size:12.5px;">No visits with him logged yet — pick him when you log the next visit.</div>'}
    ${da.visitLog.length>10?`<div style="color:var(--muted); font-size:11.5px; text-align:center;">+${da.visitLog.length-10} more in the detailed report</div>`:''}
    <button class="btn secondary" style="margin-top:12px;" onclick="closeModal()">Close</button>
  `);
}
async function saveDoctorField(clinicId, docId, field, value){
  const { c, d } = _docRow(clinicId, docId);
  if(!c || !d || !canViewClinic(c)) return;
  if(field === 'name'){
    value = (value||'').trim();
    if(!value){ showToast('The name cannot be empty'); return; }
  }
  d[field] = value;
  const r = await persistTold('clinics');
  saveToast(r, 'clinics', "✅ Saved on the doctor's card");
  if(document.getElementById('ddBody')) renderDoctorsDb();
}
async function addHandover(clinicId, docId){
  const { c, d } = _docRow(clinicId, docId);
  if(!c || !d || !canViewClinic(c)) return;
  const kindEl = document.querySelector('#hoKind .chip.on');
  const what = (document.getElementById('hoWhat').value||'').trim();
  const qty = Math.max(1, parseInt(document.getElementById('hoQty').value,10)||1);
  const date = document.getElementById('hoDate').value || todayStr();
  if(!what){ showToast('Write what was handed over'); return; }
  d.handovers = d.handovers || [];
  const entry = {id:uid(), date, kind: kindEl?kindEl.dataset.kind:'other', what, qty, by: currentUser.name};
  d.handovers.push(entry);
  // The toast tells what the save did: in the cloud, kept on this phone (it
  // uploads by itself), or nothing — then the entry is taken back off the
  // screen, so nothing looks saved that is not.
  const told = await persistTold('clinics'); // this save's own outcome, never an earlier save's
  if(told.ok) showToast('🎁 Handover recorded');
  else {
    const out = told.outcome || {};
    if(out.denied || out.tooLarge){ // refused, or too large: never kept as "uploads by itself" — taken back off the screen
      const cc = clinics.find(x=>x.id===clinicId), dd = cc && (cc.doctors||[]).find(x=>x.id===docId);
      if(dd && Array.isArray(dd.handovers)) dd.handovers = dd.handovers.filter(h => h.id !== entry.id);
      saveToast(told, 'clinics', '');
    }
    else if(out.queued && out.mirrored) showToast('📴 Handover kept on this device — it uploads automatically when back online');
    else if(out.queued) showToast('⚠️ Handover not saved on this device (storage full) — keep the app open until it uploads');
    else {
      const cc = clinics.find(x=>x.id===clinicId), dd = cc && (cc.doctors||[]).find(x=>x.id===docId);
      if(dd && Array.isArray(dd.handovers)) dd.handovers = dd.handovers.filter(h => h.id !== entry.id);
      showToast('⚠️ Not saved — the handover was not added. Try again with a connection.');
    }
  }
  openDoctorProfile(clinicId, docId);
}
async function removeHandover(clinicId, docId, hid){
  const { c, d } = _docRow(clinicId, docId);
  if(!c || !d || !canViewClinic(c)) return;
  d.handovers = (d.handovers||[]).filter(h=>h.id!==hid);
  const r = await persistTold('clinics');
  saveToast(r, 'clinics', ''); // said only when it did not land
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
  // Every pad this doctor got, from the one ledger (his visit lines and the
  // older profile entries) — these rows add up to the total above.
  const rxRows = rxReady() ? UMCore.rxLedger({ clinics: [c], visits }).filter(r => r.listed && r.doctorId === docId).sort((a,b) => b.date.localeCompare(a.date)) : [];
  const hoById = {}; (d.handovers||[]).forEach(h => { if(h && h.id != null) hoById[h.id] = h; });
  const rows = [
    ['UltraMed — Doctor Report', d.name],
    ['Specialty', d.title||''], ['Clinic', c.name], ['Rep', c.rep||''],
    ['Phone', d.phone||''], ['Birthday', d.birthday||''], ['Follow-up rhythm', d.cadence||'—'],
    ['Field visits', da.fieldVisits], ['Calls', da.calls], ['Last visit', da.lastVisit||'—'],
    ['Prescription pads (total)', da.handovers.prescription], ['Prescription pads (this month)', da.handovers.rxMonth],
    ['Samples', da.handovers.sample], ['Gifts', da.handovers.gift],
    ['Clinic ERP sales this month (KD)', Math.round((clinicMtd.net||0)*100)/100],
    ['Notes', d.notes||''],
    [''],
    ['— VISIT HISTORY —'],
    ['Date','Rep','Type','Order (KD)','Notes','No-order reason'],
    ...da.visitLog.map(v=>[v.date, v.rep, v.callOnly?('Call: '+(v.channel||'')):'Field visit', v.orderTaken?(v.orderTotal||0):'', v.notes||'', v.noOrderReason||'']),
    [''],
    ['— PRESCRIPTION PADS —'],
    ['Date','Type','Pads','Logged by','Source','Note'],
    ...rxRows.map(r => [r.date, r.source === 'visit' ? rxTypeNameOf(r.type, r.name) : 'Type not recorded (doctor profile)', r.qty,
      r.rep + (r.withRep ? ' with ' + r.withRep : ''), r.source === 'visit' ? 'Visit' : 'Doctor profile', r.source === 'visit' ? '' : ((hoById[r.id] || {}).what || '')]),
    [''],
    ['— HANDOVERS (samples / gifts / other) —'],
    ['Date','Kind','What','Qty','By'],
    ...(d.handovers||[]).filter(h=>h && (h.kind!=='prescription' || !rxReady())).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(h=>[h.date, h.kind, h.what||'', h.qty||1, h.by||'']), // (an old cached core.js: its prescription entries stay listed here)
    [''],
    ['— CLINIC INVOICE SYNC (returns & free goods for '+c.name+') —'],
    ['Date','Doc','Type','Product','Qty','Value (KD)'],
    ...led.ret.map(r=>[r.date, r.doc, isExchangeLine(r)?'Exchange':'Return', r.product||r.brand||'', r.qty||'', -r.retAmount]),
    ...led.foc.map(r=>[r.date, r.doc, r.kind==='deal'?'Deal bonus':'Sample/FOC', r.product||r.brand||'', r.qty||'', 0]),
  ];
  downloadXlsx('UltraMed-Doctor-'+(d.name||'report').replace(/[^\w\u0600-\u06FF-]+/g,'_')+'.xlsx', rows, 'Doctor');
  showToast('📄 The detailed report is downloading');
}
function exportDoctorsDbXlsx(){
  const repFilter = currentUser.role==='supervisor' ? 'all' : currentUser.name;
  const docs = UMCore.doctorAnalytics({clinics: ddPool(), visits, today: todayStr(), repFilter});
  const rawOf = d => ((clinics.find(c=>c.id===d.clinicId)||{}).doctors||[]).find(x=>x.id===d.id) || {};
  const rows = [['Doctor','Specialty','Clinic','Rep','Role','Influence','Stage','Phone','WhatsApp','Email','Birthday','Best time','Interests','Competitor','Next step','Rhythm','Status','Field visits','Calls','Last visit','Prescription pads (month)','Prescription pads (total)','Samples','Gifts','Notes'],
    ...docs.map(d=>{ const r=rawOf(d); return [d.name, d.title, d.clinicName, d.rep, DOC_ROLE_LABEL[r.role]||'', DOC_INFLUENCE_LABEL[r.influence]||'', DOC_STAGE_LABEL[r.stage]||'', d.phone, r.whatsapp||'', r.email||'', d.birthday, r.bestTime||'', r.interests||'', r.competitor||'', r.nextStep||'', d.cadence||'', d.cadenceStatus==='due'?('OVERDUE '+d.overdueDays+'d'):d.cadenceStatus, d.fieldVisits, d.calls, d.lastVisit||'', d.handovers.rxMonth, d.handovers.prescription, d.handovers.sample, d.handovers.gift, d.notes]; })];
  downloadXlsx('ultramed-doctors-database.xlsx', rows, 'Doctors');
}
// The Prescriptions tab as a workbook: by doctor, by center, by type, then
// every line it was counted from. A growth that cannot be computed is an
// empty cell (nothing the same days before, or a window that did not load).
function exportRxXlsx(){
  if(!rxReady() || typeof UMCore.rxGrowth !== 'function'){ showToast(RX_STALE_MSG); return; }
  const g = rxGrowthNow(), T = g.totals;
  const gr = x => x == null ? '' : x;
  const byClinic = {}; clinics.forEach(c => { byClinic[c.id] = c; });
  const who = r => {
    if(r.doctorId == null) return 'The clinic (no one person)';
    const d = ((byClinic[r.clinicId] || {}).doctors || []).find(x => x && x.id === r.doctorId);
    return d ? d.name : 'A doctor no longer listed';
  };
  const rows = [
    ['Doctor','Clinic','Rep','Pads this week','Same days last week','Week growth %','Pads this month','Same days last month','Month growth %','Pads all time'],
    ...g.byDoctor.map(d => [d.name, d.clinicName, d.rep, d.week, d.prevWeek, gr(d.weekGrowth), d.month, d.prevMonth, gr(d.monthGrowth), d.total]),
    [''],
    ['Center','Rep','Doctors','Pads this week','Same days last week','Week growth %','Pads this month','Same days last month','Month growth %','Pads all time','Left at the clinic','Doctor no longer listed'],
    ...g.byClinic.map(c => [c.name, c.rep, c.doctors, c.week, c.prevWeek, gr(c.weekGrowth), c.month, c.prevMonth, gr(c.monthGrowth), c.total, c.unnamed, c.unlisted]),
    ['Total', '', '', T.week, T.prevWeek, gr(T.weekGrowth), T.month, T.prevMonth, gr(T.monthGrowth), T.total],
    [''],
    ['Type','Status','Pads this week','Same days last week','Pads this month','Same days last month','Pads all time'],
    ...g.byType.map(t => [t.type == null ? 'Type not recorded (doctor profile)' : t.name, t.active === true ? 'Active' : t.active === false ? 'Retired' : '', t.week, t.prevWeek, t.month, t.prevMonth, t.total]),
    [''],
    ['Week = Sunday to today, against the same days of last week. Month = day 1 to today, against the same days of last month. Counted in pads.'],
    ...(_visitsBroken.length ? [['Visits of ' + _visitsBroken.join(', ') + ' did not load — figures that include them are incomplete.']] : []),
    [''],
    ['— EVERY PRESCRIPTION —'],
    ['Date','Clinic','Doctor','Type','Pads','Logged by','Source'],
    ...g.rows.map(r => [r.date, (byClinic[r.clinicId] || {}).name || '', who(r), r.source === 'visit' ? rxTypeNameOf(r.type, r.name) : 'Type not recorded (doctor profile)', r.qty,
      r.rep + (r.withRep ? ' with ' + r.withRep : ''), r.source === 'visit' ? 'Visit' : 'Doctor profile']),
  ];
  downloadXlsx('ultramed-prescriptions-growth.xlsx', rows, 'Prescriptions');
}
// ---- PRESCRIPTION TYPES (supervisor) ----
// The printed forms the reps pick on the visit form, in the order they see
// them. One document, state/rxTypes = {v, rev, by, at, types:[{id, name,
// active, …}]}, saved whole by saveRxTypes as a compare-and-set on `rev`: a
// list changed on another device is never overwritten, memory and this
// device's copy change only once the cloud confirmed, and nothing is queued
// offline. Ids are never reused or deleted (a type is retired), so every
// visit keeps pointing at its form; unknown fields are kept (room for brands).
const RX_TYPES_WRITE_MS = 12000;
// The editor while open: { rev shown, types (a working copy), newName, wids:
// the write ids of this editor's save attempts } — or { waiting, loading }
// while the list itself has not loaded on this phone.
let _rxEd = null;
// Every types save this phone attempted (its write id travels in the saved
// document as `wid`): a save that lands after the app stopped waiting for it
// is recognised as this phone's own — never reported as "another device".
const _rxMyWids = new Set();
// The list did not come from the cloud on this phone (the read failed and
// there is no device copy): the built-in forms in memory are not the team's
// list, so the editor waits for the list instead of offering them for editing.
function rxTypesUnread(){ return _rxTypesRead !== 'read' && !rxTypesDoc; } // never read yet (failed, or still reading): not "Not set up yet"
// Is this editor the sheet on screen? Cancel clears _rxEd; a tap outside the
// sheet, or another sheet opened since, does not — so the screen is asked too.
function rxEdOnScreen(ed){
  const back = document.getElementById('modalBack');
  return !!ed && _rxEd === ed && !!back && back.classList.contains('show') && !!document.getElementById(ed.waiting ? 'rxtLoadNote' : 'rxtList');
}
function openRxTypes(){
  if(!requireAdmin()) return;
  if(!rxReady()){ showToast(RX_STALE_MSG); return; }
  if(rxTypesUnread()){ _rxEd = { waiting: true, loading: false }; rxTypesLoad(_rxEd); return; }
  _rxEd = { rev: rxTypesDoc && typeof rxTypesDoc.rev === 'number' ? rxTypesDoc.rev : 0, types: JSON.parse(JSON.stringify(rxTypes())), newName: '', wids: [] };
  renderRxTypesEditor();
}
// The editor waiting for the list: says so plainly; Save is paused until the
// list is in ("Try again", or the next background refresh).
function renderRxTypesWaiting(ed){
  if(!ed || _rxEd !== ed) return;
  showModal(`
    <h3 style="margin-top:0;" data-sections>${I('pill')} <span>Prescription types</span></h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">The printed prescription forms we hand to doctors. Reps pick the type when they log a visit.</p>
    <div id="rxtLoadNote" class="card" style="padding:10px 12px; margin-bottom:12px; font-size:13px; line-height:1.5; background:var(--amber-dim); color:var(--amber-ink); box-shadow:none;">${ed.loading
      ? 'Loading the prescription types…'
      : 'The prescription types could not be loaded — saving is paused until they load. Check the connection, then tap Try again.'}</div>
    ${ed.loading ? '' : '<button type="button" class="btn secondary" id="rxtRetry" onclick="rxTypesRetry()">Try again</button>'}
    <button class="btn" id="rxtSave" disabled>Save</button>
    <button class="btn ghost" onclick="_rxEd = null; closeModal()">Cancel</button>
  `);
}
// Read the list for a waiting editor; once it is in, the editor itself opens.
async function rxTypesLoad(ed){
  if(!ed || !ed.waiting || ed.loading) return;
  ed.loading = true;
  renderRxTypesWaiting(ed);
  let r = null, ok = false;
  const gen0 = _rxTypesGen;
  try{ r = await withTimeout(window.storage.get('rxTypes', true), 8000); ok = true; }
  catch(e){ console.warn('prescription types: read failed', e); }
  ed.loading = false;
  // keep what the read brought unless a save on this phone confirmed a newer list meanwhile
  if(ok && (!rxTypesDoc || gen0 === _rxTypesGen)){
    const v = UMCore.safeParse(r && r.value, null);
    rxTypesDoc = v && typeof v === 'object' && !Array.isArray(v) ? v : null; _rxTypesGen++;
    if(r && r.value != null) mirrorSave('rxTypes', r.value);
    delete _loadFailed.rxTypes; delete _mirrorUsed.rxTypes; _rxTypesRead = 'read';
    rxTypesChanged();
  }
  if(!rxEdOnScreen(ed)) return; // closed meanwhile
  if(!rxTypesUnread()) openRxTypes(); else renderRxTypesWaiting(ed);
}
function rxTypesRetry(){ if(_rxEd && _rxEd.waiting) rxTypesLoad(_rxEd); }
// A background refresh (loadAll) brought the list while the editor waited for it.
function rxTypesRefreshed(){ if(_rxEd && _rxEd.waiting && !_rxEd.loading && !rxTypesUnread() && rxEdOnScreen(_rxEd)) openRxTypes(); }
// Pads already logged under each type (every visit on this device).
function rxTypeCounts(){
  const n = {};
  UMCore.dedupeVisits(visits).unique.forEach(v => UMCore.visitRxLines(v).forEach(l => { n[l.type] = (n[l.type] || 0) + l.qty; }));
  return n;
}
function renderRxTypesEditor(){
  const ed = _rxEd;
  if(!ed || ed.waiting) return;
  const counts = rxTypeCounts();
  const active = ed.types.filter(t => t.active), retired = ed.types.filter(t => !t.active);
  const logged = id => `<span style="font-size:11px; color:var(--muted); white-space:nowrap;">${rxPadsText(counts[id] || 0)} logged</span>`;
  const when = rxTypesDoc && rxTypesDoc.at ? fmtDate(String(rxTypesDoc.at).slice(0, 10)) : '';
  // Who changed the list last: the label is translated on its own; the name and
  // the date each sit in their own direction-isolated span — in Arabic a Latin
  // name would otherwise pull the day's digit away from its month.
  const lastChanged = rxTypesDoc && rxTypesDoc.by
    ? `<span>Last changed by</span> <span dir="auto">${esc(rxTypesDoc.by)}</span> · <span dir="auto">${esc(when || '—')}</span>`
    : 'Not set up yet — reps see the two built-in forms.';
  showModal(`
    <h3 style="margin-top:0;" data-sections>${I('pill')} <span>Prescription types</span></h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">The printed prescription forms we hand to doctors. Reps pick the type when they log a visit.</p>
    <div id="rxtList">${active.map(t => `
      <div class="rxt-row" data-rxt="${esc(t.id)}" style="margin-bottom:12px;">
        <input type="text" class="rxt-name" dir="auto" maxlength="40" value="${esc(t.name)}" aria-label="Type name" style="margin:0;">
        <div style="display:flex; gap:8px; align-items:center; justify-content:space-between; margin-top:5px;">
          ${logged(t.id)}
          <button type="button" class="chip small rxt-retire" onclick="retireRxType(this.closest('[data-rxt]').dataset.rxt)">Retire</button>
        </div>
      </div>`).join('')}</div>
    <div style="margin:4px 0 12px;">
      <input type="text" id="rxtNewName" dir="auto" maxlength="40" value="${esc(ed.newName || '')}" placeholder="e.g. Orthodontic prescription" aria-label="Type name" style="margin:0;" onkeydown="if(event.key==='Enter'){event.preventDefault(); addRxType();}">
      <div style="display:flex; justify-content:flex-end; margin-top:5px;"><button type="button" class="chip small" id="rxtAdd" onclick="addRxType()">+ Add a type</button></div>
    </div>
    ${retired.length ? `<div class="section-title" style="margin-top:6px;"><span>Retired types</span></div>
    <p style="color:var(--muted); font-size:12px; margin:-4px 0 8px;">Hidden from the visit form. Visits already logged keep it.</p>
    <div id="rxtRetired">${retired.map(t => `
      <div class="rxt-row" data-rxt="${esc(t.id)}" style="display:flex; gap:6px; align-items:center; margin-bottom:8px;">
        <span dir="auto" style="flex:1; min-width:0; overflow-wrap:anywhere; color:var(--muted);">${esc(t.name)}</span>
        ${logged(t.id)}
        <button type="button" class="chip small rxt-restore" onclick="restoreRxType(this.closest('[data-rxt]').dataset.rxt)">Restore</button>
      </div>`).join('')}</div>` : ''}
    <p style="color:var(--muted); font-size:12px; line-height:1.5;">Renaming changes the name on every visit already logged under this type — rename only to correct the name of the same printed form. A different form is a new type.</p>
    <p style="color:var(--muted); font-size:12px;">${lastChanged}</p>
    <button class="btn" id="rxtSave" onclick="saveRxTypes()">Save</button>
    <button class="btn ghost" onclick="_rxEd = null; closeModal()">Cancel</button>
  `);
}
// Typed names are copied into the working list before every action, so a
// rename is never lost when the list is drawn again.
function rxEdRead(){
  if(!_rxEd || _rxEd.waiting) return;
  document.querySelectorAll('#rxtList [data-rxt]').forEach(row => {
    const t = _rxEd.types.find(x => x.id === row.dataset.rxt), inp = row.querySelector('input.rxt-name');
    if(t && inp) t.name = inp.value;
  });
  const nn = document.getElementById('rxtNewName');
  if(nn) _rxEd.newName = nn.value;
}
const rxNameKey = s => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
// The name in the new-type box joins the working list, with the checks of
// "+ Add a type". false = refused (its toast is shown, nothing is added).
function rxAddPending(ed){
  const name = String(ed.newName || '').trim();
  if(!name){ showToast('Every type needs a name'); return false; }
  if(name.length > 40){ showToast('A name can be up to 40 characters'); return false; }
  if(ed.types.some(t => rxNameKey(t.name) === rxNameKey(name))){ showToast('Two types have the same name'); return false; }
  let id = uid();
  while(ed.types.some(t => t.id === id)) id = uid(); // never an id already used
  ed.types.push({ id, name, active: true });
  ed.newName = '';
  return true;
}
function addRxType(){
  if(!_rxEd || _rxEd.waiting || !requireAdmin()) return;
  rxEdRead();
  if(rxAddPending(_rxEd)) renderRxTypesEditor();
}
function retireRxType(id){
  if(!_rxEd || _rxEd.waiting) return;
  rxEdRead();
  const t = _rxEd.types.find(x => x.id === id);
  if(!t || !t.active) return;
  if(_rxEd.types.filter(x => x.active).length <= 1){ showToast('Keep at least one active type'); return; }
  t.active = false;
  renderRxTypesEditor();
}
function restoreRxType(id){
  if(!_rxEd || _rxEd.waiting) return;
  rxEdRead();
  const t = _rxEd.types.find(x => x.id === id);
  if(!t) return;
  t.active = true;
  renderRxTypesEditor();
}
// Prescription types changed in memory: the screens that show them follow.
function rxTypesChanged(){
  if(activeView === 'log') renderRxStep();
  if(activeView === 'doctors' && document.getElementById('ddBody')) renderDoctorsDb();
}
// While a save is on its way the list cannot change under it — a change made
// meanwhile would be closed away under "saved". Cancel stays available.
function rxEdFreeze(frozen){
  document.querySelectorAll('#rxtList input, #rxtList button, #rxtRetired button, #rxtNewName, #rxtAdd').forEach(el => { el.disabled = !!frozen; });
}
// A list as compared for "the cloud already holds exactly this": ids, names, active, order.
function rxTypesKey(list){ return JSON.stringify(UMCore.rxTypeList(Array.isArray(list) ? list : []).map(t => [t.id, t.name, t.active])); }
async function saveRxTypes(){
  if(!requireAdmin() || !_rxEd || _rxEd.waiting) return;
  if(_rxSaving){ showToast('The previous save is still on its way — tap Save again in a moment.'); return; } // (another editor, opened after Cancel)
  if(!rxReady()){ showToast(RX_STALE_MSG); return; }
  rxEdRead();
  const ed = _rxEd;
  // A name typed in the new-type box and not added yet is part of what is
  // saved: added with the same checks as "+ Add a type" — or, refused, the
  // save stops on that toast with nothing written. Never dropped under "saved".
  if(String(ed.newName || '').trim()){
    if(!rxAddPending(ed)) return;
    renderRxTypesEditor(); // it shows in the list now
  }
  const next = ed.types.map(t => Object.assign({}, t, { name: String(t.name == null ? '' : t.name).trim(), active: t.active !== false }));
  const problem = UMCore.rxTypesProblem(next);
  if(problem){
    showToast({ 'name-empty': 'Every type needs a name', 'name-long': 'A name can be up to 40 characters',
      'name-duplicate': 'Two types have the same name', 'no-active': 'Keep at least one active type' }[problem] || 'Not saved — check the connection and tap Save again.');
    return;
  }
  const shownRev = ed.rev;
  // This attempt's write id. The only saves it may build on are this same
  // editor's earlier attempts that landed after the app stopped waiting —
  // never another device's list, and never a later attempt of its own.
  const earlier = ed.wids.slice(), wid = uid();
  ed.wids.push(wid); _rxMyWids.add(wid);
  const nextKey = rxTypesKey(next);
  let conflict = false, committed = null, seen = null, already = false;
  const fn = s => { // Firestore may run this more than once: every run starts clean
    conflict = false; committed = null; seen = null; already = false;
    const cur = s == null ? null : UMCore.safeParse(s, null);
    const curObj = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : null;
    const curRev = curObj && typeof curObj.rev === 'number' ? curObj.rev : 0;
    if(curRev !== shownRev){
      const own = !!curObj && typeof curObj.wid === 'string' && earlier.includes(curObj.wid);
      if(!own){ conflict = true; seen = cur; return null; }
      if(rxTypesKey(curObj.types) === nextKey){ already = true; seen = curObj; return null; } // the cloud holds exactly this list already
    }
    const cloudById = {};
    (curObj && Array.isArray(curObj.types) ? curObj.types : []).forEach(t => { if(t && typeof t.id === 'string') cloudById[t.id] = t; });
    // fields a later version added to a type (brands …) are kept
    const doc = Object.assign({}, curObj || {}, { v: 1, rev: curRev + 1, by: currentUser.name, at: localStamp(), wid,
      types: next.map(t => Object.assign({}, cloudById[t.id] || {}, t)) });
    committed = doc;
    return JSON.stringify(doc);
  };
  _rxSaving = true;
  const btn = document.getElementById('rxtSave');
  if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  rxEdFreeze(true);
  let written = null, timedOut = false;
  try{ written = await storageUpdate('rxTypes', fn, RX_TYPES_WRITE_MS); }
  catch(e){
    timedOut = /timeout/.test(String(e && e.message));
    if(!timedOut) console.warn('prescription types not saved', e);
  }
  finally{ _rxSaving = false; }
  // Only the editor that saved, still the sheet on screen, is closed or
  // reopened — a sheet opened after Cancel is never touched (a toast only).
  const onScreen = rxEdOnScreen(ed);
  if((written != null && committed) || already){
    rxTypesDoc = already ? seen : committed; _rxTypesGen++;
    mirrorSave('rxTypes', already ? JSON.stringify(seen) : written);
    delete _loadFailed.rxTypes; delete _mirrorUsed.rxTypes; _rxTypesRead = 'read';
    if(_rxEd === ed) _rxEd = null;
    if(onScreen) closeModal();
    showToast('✅ Prescription types saved');
    rxTypesChanged();
    return;
  }
  if(conflict){
    // what the cloud holds now: in memory and on the device; the editor, if still on screen, reopens on it
    rxTypesDoc = seen && typeof seen === 'object' && !Array.isArray(seen) ? seen : null; _rxTypesGen++;
    if(seen != null) mirrorSave('rxTypes', JSON.stringify(seen));
    delete _loadFailed.rxTypes; delete _mirrorUsed.rxTypes; _rxTypesRead = 'read';
    // this phone's own earlier save (from an editor since closed) that landed late — never "another device"
    const mine = !!(rxTypesDoc && typeof rxTypesDoc.wid === 'string' && _rxMyWids.has(rxTypesDoc.wid));
    if(onScreen){
      openRxTypes();
      showToast(mine ? 'Your earlier save reached the cloud after all — reopened with the saved list. Nothing else was saved.'
        : 'Changed on another device — reopened with the latest list. Nothing was saved.');
    } else {
      if(_rxEd === ed) _rxEd = null;
      showToast(mine ? 'Your earlier save reached the cloud after all — nothing else was saved.' : 'Changed on another device — nothing was saved.');
    }
    rxTypesChanged();
    return;
  }
  // not saved (or no answer yet): memory untouched; the editor, if still on screen, keeps the edits
  if(onScreen){ rxEdFreeze(false); const b2 = document.getElementById('rxtSave'); if(b2){ b2.disabled = false; b2.textContent = 'Save'; } }
  showToast(timedOut ? 'No answer from the cloud yet — reopen the list in a minute to see whether it was saved.'
    : onScreen ? 'Not saved — check the connection and tap Save again.' : 'Prescription types not saved — check the connection and make the change again.');
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
// (v126 speed, part 4: the lines of the pass kept per data state — erpShareNow — which also follows the returns policy;
// this memo was keyed on the files' ids and line counts only)
let _allRowsMemo = null;
function erpAllRows(){
  const sh = erpShareNow(); if(sh) return sh.lines();
  const sig = erpReturnPolicy() + '|' + erpPeriods().map(p2=>p2.id+':'+(p2.rows?p2.rows.length:0)).join('|');
  if(!_allRowsMemo || _allRowsMemo.sig !== sig){
    let all = [];
    erpPeriods().forEach(p2=>{ all = all.concat(erpViewRows(p2)); });
    _allRowsMemo = { sig, all };
  }
  return _allRowsMemo.all;
}
// The market's purchase lines from the ERP files (UMCore.crossSellErpLines), the same for every clinic's guide: kept
// while the lines of the kept pass (one per data state) and what the catalog says of each product (name, brand,
// category, price, in order) are the same (v126 speed, part 4).
let _xsKept = { lines: null, prod: null, erp: null };
function clinicSellGuide(clinicId){
  const sh = erpShareNow(), rows = erpAllRows();
  let erpLines;
  if(sh && typeof UMCore.crossSellErpLines === 'function'){
    const prod = JSON.stringify((products || []).map(p => p ? [p.id, p._key, p.name, p.brand, p.cat, p.price] : null));
    if(_xsKept.lines !== rows || _xsKept.prod !== prod) _xsKept = { lines: rows, prod, erp: UMCore.crossSellErpLines(rows, sh.match, products) };
    erpLines = _xsKept.erp;
  }
  return UMCore.crossSellPlan({ clinicId, clinics, products, visits,
    erpRows: rows, erpMap, today: todayStr(), limit: 3, share: sh, erpLines });
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
// (every line and each clinic's lines: the pass kept per data state when there is one — the same lines, read only)
function caAllRowsByClinic(){
  const sh = erpShareNow();
  if(sh) return { by: sh.byClinic(), all: sh.lines() };
  const by = Object.create(null);
  let all = [];
  erpPeriods().forEach(p2=>{ all = all.concat(erpViewRows(p2)); });
  const match = erpMatchFn();
  all.forEach(r=>{
    const m = match((r.customer||'').trim());
    if(!m.clinicId) return;
    (by[m.clinicId] = by[m.clinicId] || []).push(r);
  });
  return { by, all };
}
function caMonthClinicSales(){
  const today = todayStr(), mStart = today.slice(0,7)+'-01';
  const byClinic = {};
  const match = erpMatchFn(), sh = erpShareNow(), viewOf = p2 => sh ? sh.rows(p2) : erpViewRows(p2);
  erpPeriods().filter(p2=>p2.to>=mStart && p2.from<=today).forEach(p2=>viewOf(p2).forEach(r=>{
    if(r.date < mStart || r.date > today) return;
    const m = match((r.customer||'').trim());
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
  chipsEl.innerHTML = sup ? REPS.map(r=>`<div class="chip ${caRep===r?'on':''}" onclick="caRep='${jsArg(r)}'; renderClinicAnalysis();">${esc(r)}</div>`).join('') : '';
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
  const vByC = visitsByClinic(); // (a clinic's visits in the list's order, found once — v126 speed, part 4)
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
    const ofCard = members.length === 1 ? (vByC.get(members[0].id) || []) : visits.filter(v=>ids.has(v.clinicId)); // (a family's in the list's order, as before)
    const vs = ofCard.filter(v=>v.date>=mStart && v.date<=today);
    const fieldN = vs.filter(v=>UMCore.isFieldVisit(v)).length;
    const callsN = vs.filter(v=>v.callOnly).length;
    const lastAll = ofCard.slice().sort((a,b2)=>b2.date.localeCompare(a.date));
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
    // Concrete units for the #1 gap: "≈ 3× Cordless Plus" right on the card — worked out for a card when it is drawn
    // (the cards are drawn in pages, v126 speed part 4: the same plan from the same lines)
    cards.push({ id:c.id, label, cls:c.cls, members, tgt:Math.round(tgt*100)/100, act:Math.round(act*100)/100,
      pct, gap: Math.round(Math.max(0,tgt-act)*100)/100, fieldN, callsN, lastV, notes, docs, contact, opps,
      nextFollowUp: members.map(m2=>m2.nextFollowUp).filter(Boolean).sort()[0] || null });
  });

  const bm = officialRevenue(rep);
  const goal = t.revenue || Object.values(brandTargets).reduce((a,b2)=>a+b2,0);
  const daysLeft = UMCore.workingDaysBetween(today, today.slice(0,7)+'-'+String(getMonthDates(today).length).padStart(2,'0'));
  const shown = cards.filter(cd=>!q || cd.label.toLowerCase().includes(q)).sort((a,b2)=>b2.gap-a.gap);
  const covered = cards.filter(cd=>cd.act>0.005).length;

  body.innerHTML = `
    <div class="card ca-sum" style="margin-bottom:12px;">
      <div class="row-between"><div style="font-weight:800; font-size:15px;">${esc(rep)} — ${new Date(today+'T00:00:00').toLocaleDateString(uiLocale(),{month:'long'})}</div>
        <span style="color:var(--muted); font-size:11.5px;">${daysLeft} working days left</span></div>
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:10px; text-align:center;">
        <div><div style="font-weight:800; font-size:14.5px;">${money(goal)}</div><div style="font-size:9.5px; color:var(--muted); letter-spacing:.06em;">TARGET</div></div>
        <div><div style="font-weight:800; font-size:14.5px;">${bm.has?money(bm.amount):'—'}</div><div style="font-size:9.5px; color:var(--muted); letter-spacing:.06em;">ACHIEVED${bm.src?`<br><span style="font-size:8px; letter-spacing:0;">${esc(bm.src)}</span>`:''}</div></div>
        <div><div style="font-weight:800; font-size:14.5px; color:${goal&&bm.has&&goal-bm.amount>0?'var(--coral-ink)':'var(--sage-ink)'};">${bm.has?money(Math.max(0,goal-bm.amount)):'—'}</div><div style="font-size:9.5px; color:var(--muted); letter-spacing:.06em;">TO GO</div></div>
        <div><div style="font-weight:800; font-size:14.5px;">${covered}/${cards.length}</div><div style="font-size:9.5px; color:var(--muted); letter-spacing:.06em;">CLINICS BOUGHT</div></div>
      </div>
    </div>
    ${pagedRows('ca', [rep, q, currentUser.name, currentUser.role].join('\u0001'), shown, cd=>{
      if(cd.topPlan === undefined){
        cd.topPlan = null;
        if(cd.opps.length){
          const clinicRows = []; cd.members.forEach(m2=>{ (rowsIdx.by[m2.id]||[]).forEach(r=>clinicRows.push(r)); });
          const up = UMCore.unitSellPlan({brand: cd.opps[0].brand, gap: cd.opps[0].gap, clinicRows, allRows, products});
          if(up.length) cd.topPlan = up;
        }
      }
      const barPct = Math.max(0, Math.min(100, cd.pct)); // returns can push actuals negative
      // the clinic's share of the target judged by the one pace rule (paceFor, to the day her figure runs to; until 17 Nov:
      // gold from 50 %, whatever the day of the month)
      const cP = paceFor(cd.act, cd.tgt, bm.asOf);
      return `<div class="card ca-row" style="margin-bottom:10px;">
        <div class="row-between">
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="cls cls-${clsKey(cd.cls)}">${esc(cd.cls||'-')}</span>
            <div>
              <div class="clinic-name">${esc(cd.label)}</div>
              <div class="clinic-sub">${cd.fieldN} visit${cd.fieldN===1?'':'s'} · ${cd.callsN} call${cd.callsN===1?'':'s'} this month${cd.lastV?` · last ${fmtDate(cd.lastV.date)}`:' · never visited'}</div>
            </div>
          </div>
          <div style="text-align:start; flex-shrink:0;">
            <div style="font-weight:800; font-size:14px;">${money(cd.act)} <span style="color:var(--muted); font-weight:500; font-size:11px;">/ ${money(cd.tgt)}</span></div>
            <div style="font-size:10.5px; font-weight:700; color:${paceInk(cP, 'var(--gold-ink)', 'var(--coral-ink)')};"${cP ? ` data-pace="${cP.state}"` : ''}>${cd.pct}% of clinic target</div>
          </div>
        </div>
        <div style="height:6px; border-radius:3px; background:var(--paper); overflow:hidden; margin:8px 0;"><div style="width:${barPct}%; height:100%; background:${cP && cP.state === 'reached'?'var(--sage)':'var(--teal)'};"></div></div>
        ${cd.opps.length?`<div style="font-size:12.5px; margin-bottom:6px;"><b>🎯 Sell next:</b> ${cd.opps.slice(0,3).map(o=>`${esc(o.brand)} <span class="num" style="color:var(--coral-ink);">${money(o.gap)}</span>`).join(' · ')}</div>${cd.topPlan?`<div style="display:flex; gap:6px; align-items:center; margin-bottom:6px; overflow:hidden;">
          ${cd.topPlan.slice(0,3).map(x=>`<div style="position:relative;">${playbookThumb(x.product, 42)}<span style="position:absolute; top:-5px; inset-inline-end:-5px; background:var(--teal); color:#fff; font-size:9.5px; font-weight:800; border-radius:99px; padding:1px 5px;">×${x.units}</span></div>`).join('')}
          <div style="font-size:11px; color:var(--teal); font-weight:600; min-width:0;">${esc(cd.opps[0].brand)}</div>
        </div>`:''}`:`<div style="font-size:12.5px; color:var(--sage-ink); margin-bottom:6px;">🏆 Clinic target fully covered</div>`}
        ${cd.docs.length?`<div style="font-size:12px; color:var(--muted); margin-bottom:4px;">👨‍⚕️ ${cd.docs.slice(0,4).map(d=>esc(d.name)+(d.title?` <span style="font-size:10.5px;">(${esc(d.title)})</span>`:'')).join(' · ')}${cd.docs.length>4?` +${cd.docs.length-4}`:''}</div>`:''}
        ${cd.contact?`<div style="font-size:12px; color:var(--muted); margin-bottom:4px;">📇 ${esc(cd.contact)}</div>`:''}
        ${cd.notes.length?`<div style="font-size:11.5px; color:var(--muted); border-top:1px dashed var(--line); padding-top:5px; margin-top:5px;">${cd.notes.map(n=>`📝 <i>${fmtDate(n.date)}:</i> ${esc(n.txt)}`).join('<br>')}</div>`:''}
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button class="chip small" onclick="openClinicAllocDetail('${jsArg(cd.id)}')">📊 Brand plan</button>
          <button class="chip small" onclick="openClinicDetail('${jsArg(cd.id)}')">${I('file')} Clinic file</button>
          ${cd.nextFollowUp?`<span class="chip small" style="pointer-events:none;">⏰ ${fmtDate(cd.nextFollowUp)}</span>`:''}
        </div>
      </div>`;
    }) || '<div class="empty">No clinics match.</div>'}`;
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
              <div style="font-size:11px; color:var(--muted);">${money(x.price)} each</div></div>
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
          <div class="chip-row" style="margin-top:5px;">${SPECIALTIES.map(t=>`<div class="chip small" onclick="tagDoctorSpecialty('${jsArg(u.clinicId)}','${jsArg(u.docId)}','${jsArg(t)}')">${SPECIALTY_PLAYBOOK[t].icon} ${esc(t)}</div>`).join('')}</div>
        </div>`).join('')}
      ${untagged.length>12?`<div style="color:var(--muted); font-size:12px; text-align:center; padding-top:6px;">+${untagged.length-12} more — tag these first</div>`:''}
    </div>` : '';
  document.getElementById('playbookGrid').innerHTML = untaggedCard + SPECIALTIES.map(sp=>{
    const pb = SPECIALTY_PLAYBOOK[sp];
    const n = counts[sp]||0;
    return `<div class="tile" onclick="openPlaybook('${jsArg(sp)}')">
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
  const r = await persistTold('clinics');
  saveToast(r, 'clinics', `${SPECIALTY_PLAYBOOK[title].icon} ${d.name} → ${title}`);
  renderPlaybookGrid();
}
function openPlaybook(sp){
  const pb = SPECIALTY_PLAYBOOK[sp];
  if(!pb) return;
  const docs = [];
  clinics.filter(c=>canViewClinic(c)).forEach(c=>(c.doctors||[]).forEach(d=>{ if(d.title===sp) docs.push({name:d.name, clinic:c.name, rep:c.rep}); }));
  showModal(`
    <div class="pb-hero" data-sections style="background:linear-gradient(135deg,${pb.color} 0%,${pb.color}CC 100%);">
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
        <div class="card">${tagged.map(p=>`<div class="qty-row" style="cursor:pointer; align-items:center; gap:10px;" onclick="closeModal(); openProductDetail('${jsArg(productKey(p))}')">
          ${playbookThumb(p.name, 44)}
          <div class="pname">${esc(p.name)}<br><span style="color:var(--muted); font-size:11.5px;">${esc(p.brand||'')}${p.price!=null?' · '+money(p.price):''}</span></div>
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
      unitsSold += Number(it.qty) || 0;
      const unit = it.unitPrice!=null ? it.unitPrice : (p.price!=null ? p.price : 0);
      revenue += unit*(Number(it.qty) || 0)*(1-(o.discountPct||0)/100);
    }
  })));
  showModal(`
    ${safeUrl(p.img)?`<img class="pbig" src="${esc(safeUrl(p.img))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`:''}
    <div class="row-between" style="margin:0 0 4px;" data-sections>
      <h3 style="margin:0;">${esc(p.name)}</h3>
      ${currentUser.role==='supervisor'?`<button class="chip small" style="flex-shrink:0;" onclick="openEditProduct('${jsArg(productKey(p))}')">${I('pencil')} Edit</button>`:''}
    </div>
    <div style="color:var(--muted); font-size:13.5px; margin-bottom:16px;">${esc(p.brand||'')}</div>

    <div class="section-title" style="margin-top:0;">Technical data</div>
    <div class="card">
      <div class="spec-row"><span class="k">Item code</span><span class="v">${esc(p.id)}</span></div>
      ${p.barcode?`<div class="spec-row"><span class="k">Barcode</span><span class="v">${esc(p.barcode)}</span></div>`:''}
      <div class="spec-row"><span class="k">Unit price</span><span class="v">${p.price!=null?moneyFils(p.price):'\u2014'}</span></div>
      ${p.cat?`<div class="spec-row"><span class="k">Category</span><span class="v">${esc(p.cat)}</span></div>`:''}
      ${p.stock!==undefined?`<div class="spec-row"><span class="k">Website stock</span><span class="v" style="color:${p.stock?'var(--sage-ink)':'var(--coral-ink)'}">${p.stock?'In stock':'Out of stock'}</span></div>`:''}
      ${p.case?`<div class="spec-row"><span class="k">Case count</span><span class="v">${esc(p.case)}</span></div>`:''}
      ${p.age?`<div class="spec-row"><span class="k">Age group</span><span class="v">${esc(p.age)}</span></div>`:''}
    </div>

    ${p.desc?`<div class="section-title">Product description</div>
      <div class="card" style="font-size:13.5px; line-height:1.6;">${esc(p.desc)}</div>`:''}

    ${(p.specialties&&p.specialties.length)?`<div class="section-title">Best fit for</div>
      <div class="chip-row">${p.specialties.map(sp=>SPECIALTY_PLAYBOOK[sp]?`<div class="chip small" onclick="closeModal(); openPlaybook('${jsArg(sp)}')">${SPECIALTY_PLAYBOOK[sp].icon} ${esc(sp)}</div>`:'').join('')}</div>`:''}

    <div class="section-title">Sales notes &amp; materials</div>
    <div class="card">
      ${currentUser.role==='supervisor' ? `
        <textarea id="pNotesEdit" placeholder="Key selling points, clinical claims, competitor comparison...">${esc(p.salesNotes||'')}</textarea>
        <button class="btn secondary small" onclick="saveProductNotes('${jsArg(productKey(p))}')">Save notes</button>
      ` : `
        ${p.salesNotes?`<div style="font-size:13.5px; line-height:1.6; white-space:pre-wrap;">${esc(p.salesNotes)}</div>`:`<div style="color:var(--muted); font-size:13px;">No sales notes yet.</div>`}
      `}
      <div id="pMaterials" style="margin-top:10px;"></div>
      ${currentUser.role==='supervisor' ? `
        <div style="border-top:1px solid var(--line); margin-top:10px; padding-top:10px;">
          <input type="text" id="pMatTitle" placeholder="Material name (e.g. Brochure, Price list, Video)">
          <input type="text" id="pMatUrl" placeholder="Link (https://...)" style="margin-top:8px;">
          <button class="btn secondary small" style="margin-top:8px;" onclick="addProductMaterial('${jsArg(productKey(p))}')">+ Add material</button>
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
  const r = await persistTold('products');
  saveToast(r, 'products', 'Saved');
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
      ${currentUser.role==='supervisor'?`<button class="chip small" onclick="removeProductMaterial('${jsArg(productKey(p))}',${i})">✕</button>`:''}
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
  const r = await persistTold('products');
  renderProductMaterials(pid);
  saveToast(r, 'products', '📄 Material added');
}
async function removeProductMaterial(pid, idx){
  if(currentUser.role!=='supervisor') return;
  const p = findProduct(pid); if(!p) return;
  p.materials = productMaterials(p).map(m=>({title:m.title, url:m.url}));
  p.materials.splice(idx, 1);
  delete p.docUrl;
  const r = await persistTold('products');
  saveToast(r, 'products', ''); // said only when it did not land
  renderProductMaterials(pid);
}

// ---- CATEGORY SELLING GUIDES ----
// A category (and a brand) can come straight from the ERP file: a product added
// from "missing from the catalog" takes its ERP brand as its category. The
// buttons carry it in data-cat (the brand heading in data-brand) and the
// handler reads it from there — never inside the onclick string, where an
// apostrophe breaks the tap and a quote with code in it would run.
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
      ${currentUser.role==='supervisor'?`<button class="chip small" style="margin-top:10px;" data-cat="${esc(cat)}" onclick="openEditCategoryGuide(this.dataset.cat)">✏️ Edit this guide</button>`:''}
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
      return `<div class="card" style="cursor:pointer; padding:12px 14px; margin-bottom:8px;" data-cat="${esc(c)}" onclick="openCategoryGuide(this.dataset.cat)">
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
      ${currentUser.role==='supervisor'?`<button class="chip small" style="flex-shrink:0;" data-cat="${esc(cat)}" onclick="openEditCategoryGuide(this.dataset.cat)">${I('pencil')} Edit</button>`:''}
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
      <div class="card">${catProds.map(p=>`<div class="qty-row" style="cursor:pointer;" onclick="openProductDetail('${jsArg(productKey(p))}')">
        <div class="pname">${esc(p.name)}<br><span style="color:var(--muted); font-size:11.5px;">${esc(p.brand||'')}${p.price!=null?' · '+money(p.price):''}</span></div>
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
    <button class="btn" style="margin-top:14px;" data-cat="${esc(cat)}" onclick="saveCategoryGuide(this.dataset.cat)">Save guide</button>
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
  const r = await persistTold('categoryGuides');
  saveToast(r, 'categoryGuides', '📚 Guide saved'); // "saved" only when it landed
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
  const match = erpMatchFn(), sh = erpShareNow(); // (the pass kept for the data state: its lines and matches)
  ps.forEach(p => (sh ? sh.rows(p) : erpViewRows(p)).forEach(r => {
    if(!UMCore.inRange(r.date, from, to)) return;
    const rep = UMCore.erpRowRep(r, clinics, erpMap, p.repMap||{}, match);
    if(!rep || (repFilter !== 'all' && rep !== repFilter)) return;
    net += r.net;
    if(r.type !== 'return') docs[r.doc] = 1;
    const m = match(r.customer);
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
  const covMtd = erpMtdMap(); // one pass of the month's lines for the coach and the targets it reads (v126 speed)
  const coach = UMCore.coachInsights({ erpMtd: covMtd, from, to, today: to, repFilter: covRep, visits, clinics, targets: blendedTargets(covMtd), dayPlans })
    .filter(i => i.level !== 'good').slice(0, 3);
  const repChips = currentUser.role === 'supervisor'
    ? `<div class="chip-row" style="margin-bottom:8px;">${['all', ...REPS].map(r =>
        `<div class="chip small ${covRep===r?'on':''}" onclick="setCovRep('${jsArg(r)}')">${r==='all'?'Whole team':esc(r)}</div>`).join('')}</div>` : '';
  const tile = (n, l) => `<div class="ins-tile"><div class="it-n">${n}</div><div class="it-l">${l}</div></div>`;
  const byId = new Map(); clinics.forEach(c => { if(c && !byId.has(c.id)) byId.set(c.id, c); }); // (the first clinic with each id, as find() gives)
  const clinicOf = id => byId.get(id);
  const pick = [covRep, covDays, currentUser.name, currentUser.role].join('\u0001'); // the lists are drawn in pages (v126 speed, part 4)
  const visitedRows = pagedRows('covV', pick, cov.visited, c => {
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
            <span class="cls cls-${clsKey(c.cls)}">${esc(c.cls||'-')}</span>
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
      <button class="chip small" style="margin-top:8px;" onclick="closeModal(); openClinicDetail('${jsArg(c.id)}')">${I('file')} Open clinic</button>
    </details>`;
  });
  const needsRows = pagedRows('covN', pick, cov.needsVisit, c => `
    <div class="card" style="padding:12px 14px; margin-bottom:8px; border-inline-start:4px solid ${c.weight<=1?'var(--coral)':c.weight<=4?'#FF9500':'var(--teal)'};">
      <div class="row-between">
        <div style="display:flex; align-items:center; gap:9px;">
          <span class="cls cls-${clsKey(c.cls)}">${esc(c.cls||'-')}</span>
          <div>
            <div style="font-weight:700; font-size:14px;">${esc(c.name)}</div>
            <div style="color:var(--muted); font-size:12px;">${esc(c.rep||'')}${c.lastVisit?` · last visit ${fmtDate(c.lastVisit)}`:' · never visited'}${ew && ew.byClinic[c.id]?` · 💠 ${money(ew.byClinic[c.id])} invoiced (no visit!)`:''}</div>
          </div>
        </div>
      </div>
      ${c.reasons.map(r=>`<div style="font-size:12.5px; line-height:1.5; margin-top:6px;">${covReasonLabel(r)}</div>`).join('')}
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="chip small" onclick="closeModal(); quickLogFrom('${jsArg(c.id)}')">${I('plus')} Log a visit</button>
        <button class="chip small" onclick="closeModal(); openClinicDetail('${jsArg(c.id)}')">${I('file')} Open clinic</button>
      </div>
    </div>`);
  showModal(`
    <h3 style="margin-top:0;" data-wide data-sections data-grid>${I('clipboard')} Coverage review</h3>
    <div style="color:var(--muted); font-size:12.5px; margin-bottom:10px;">Everything done and still needed — last ${covDays} days${covRep!=='all'?' · '+esc(covRep):''}</div>
    ${repChips}
    <div class="chip-row" style="margin-bottom:12px;">
      <div class="chip small ${covDays===7?'on':''}" onclick="setCovDays(7)">7 days</div>
      <div class="chip small ${covDays===30?'on':''}" onclick="setCovDays(30)">30 days</div>
      <div class="chip small ${covDays===90?'on':''}" onclick="setCovDays(90)">90 days</div>
    </div>
    <div class="ins-grid cov-figs">
      ${tile(cov.stats.visitedCount + '/' + cov.stats.totalClinics, 'Clinics covered (' + cov.stats.coveragePct + '%)')}
      ${tile(cov.stats.needsCount, 'Need a visit')}
      ${ew
        ? tile(ew.invoices + (cov.stats.orders ? ' / ' + cov.stats.orders : ''), 'ERP invoices' + (cov.stats.orders ? ' / logged' : ''))
        : tile(cov.stats.orders, 'Orders logged')}
      ${ew
        ? tile(money(ew.net), 'Sales (ERP)')
        : tile(money(cov.stats.revenue), 'Orders logged in the app')}
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
  // (while the early open's line is up it says so for the whole screen — and a read that changes nothing draws nothing again:
  // this card would stay up after the read is in, v126 speed part 3)
  const copyUp = !_loadFailed.erpSales && !_erpBroken.length && erpCopyUp();
  if(!copyUp) erpCopyReset();
  if(_loadFailed.erpSales) return `<div class="card" style="border-inline-start:4px solid var(--coral); margin-bottom:6px;">
    <div style="font-weight:700; font-size:13.5px;">⚠️ The sales files did not load from the cloud</div>
    <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:3px;">Nothing is lost — the connection did not complete when the app opened. The sales figures are hidden for now, and saving is stopped so that an empty page is never written over your files. <b>Reopen the app on a good connection.</b></div>
  </div>`;
  if(_erpBroken.length){
    const names = erpPeriods().filter(p => p && p.rowsMissing).map(p => `${fmtDate(p.from)} – ${fmtDate(p.to)}`).join(' · ');
    return `<div class="card" style="border-inline-start:4px solid var(--coral); margin-bottom:6px;">
    <div style="font-weight:700; font-size:13.5px;">⚠️ The lines of ${_erpBroken.length === 1 ? 'a sales file' : _erpBroken.length + ' sales files'} did not load</div>
    <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:3px;">${esc(names)} — the files are saved in the cloud but their lines did not reach this device, so their figures do not show now. Nothing is written over them.</div>
    <div class="chip-row" style="margin-top:8px;"><div class="chip small on" onclick="retryErpRows()">🔄 Load again</div><div class="chip small" onclick="openErpImport()">📥 Upload the file again</div></div>
  </div>`;
  }
  return copyUp ? erpCopyCard() : '';
}
// The sales figures from this device's copy (the owner's report of 19 Nov: the card stayed up a long time and said nothing
// more). It says what keeps it up, offers Retry now (the owner, 22 Nov: professional words in English and Arabic), says
// when a retry last ended without the cloud and — still up two minutes after it first showed — to check the connection.
const ERP_COPY_HINT_MS = 120000;
let _erpCopySince = 0;    // when the card first showed (0: not up)
let _erpCopyTry = null;   // the Retry now on its way
let _erpCopyTried = 0;    // when the last Retry now ended with the card still up
let _erpCopyTimer = null; // draws the two-minute line when its time comes
let _erpNudgeKey = null;  // what the nudge shows now (erpNudgeSync)
function erpCopyUp(){ return !!_mirrorUsed.erpSales && !(typeof _copyLine !== 'undefined' && _copyLine); }
function erpCopyReset(){ _erpCopySince = 0; _erpCopyTried = 0; if(_erpCopyTimer){ clearTimeout(_erpCopyTimer); _erpCopyTimer = null; } }
// what keeps the card up: sales changes of this device the cloud does not hold (the red bar's), no connection, else a read that did not complete
function erpCopyWhy(){
  if(_erpDirty || _erpSaving || (typeof outboxHas === 'function' && outboxHas('erpSales'))) return 'unsaved';
  return navigator.onLine === false ? 'offline' : 'read';
}
function erpCopyLong(){ return erpCopyWhy() === 'read' && !!_erpCopySince && Date.now() - _erpCopySince >= ERP_COPY_HINT_MS; }
function erpCopyCard(){
  const why = erpCopyWhy(), now = Date.now();
  if(!_erpCopySince) _erpCopySince = now;
  const long = erpCopyLong();
  if(why === 'read' && !long && !_erpCopyTimer) _erpCopyTimer = setTimeout(() => { _erpCopyTimer = null; erpNudgeSync(); }, Math.max(0, ERP_COPY_HINT_MS - (now - _erpCopySince)) + 500);
  const body = why === 'unsaved' ? "This device has sales changes the cloud does not hold yet, so the figures shown are this device's. Retry now saves them, then reads the cloud again."
    : why === 'offline' ? 'This device is offline — the figures are the last it saw and may be older than what is saved. They update once it is back online.'
    : 'The cloud could not be read — the figures are the last this device saw and may be older than what is saved. Any new upload is merged with the cloud when it is saved.';
  const lines = [];
  if(_erpCopyTried) lines.push(`<span>Last attempt:</span> <span data-notr dir="auto">${esc(copyTimeText(_erpCopyTried))}</span> <span>— not completed.</span>`);
  else if(why === 'read') lines.push('<span>The app tries again by itself every 20 seconds while it is open.</span>');
  if(long) lines.push(`<span style="color:var(--status-danger, #C8372D); font-weight:600;">Still not updated after 2 minutes — check this device's internet connection.</span>`);
  const busy = !!_erpCopyTry;
  return `<div class="card" style="border-inline-start:4px solid var(--gold-ink, #B8860B); margin-bottom:6px;">
    <div style="font-weight:700; font-size:13.5px;">📴 The sales figures are from this device's copy</div>
    <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:3px;">${body}</div>
    ${lines.map(l => `<div style="font-size:12.5px; line-height:1.5; margin-top:4px;">${l}</div>`).join('')}
    <div class="chip-row" style="margin-top:8px;"><button type="button" class="chip small on" onclick="erpCopyRetry()"${busy ? ' disabled' : ''}>${busy ? 'Retrying…' : 'Retry now'}</button></div>
  </div>`;
}
// Retry now: this device's unsaved sales changes are saved first (the red bar's own save), what waits in the queue goes
// up, then the cloud is read (the refresh on its way, if one is) — the 20-second round's own steps, at once.
async function erpCopyRetry(){
  if(_erpCopyTry) return _erpCopyTry;
  const unsaved = erpCopyWhy() === 'unsaved';
  let saved = null;
  const run = (async () => {
    if((typeof _erpImporting !== 'undefined' && _erpImporting) || _erpSaving) return; // a sales upload or save on its way decides the card by itself
    if(typeof earlyUnconfirmed === 'function' && earlyUnconfirmed()) return;          // the sign-in is still being confirmed: the start's read follows by itself
    if(currentUser && currentUser.role === 'supervisor' && _erpDirty) saved = await persist('erpSales');
    if(outboxList().length) await flushOutbox();
    await loadAll();
    if(typeof _refreshFlush !== 'undefined' && _refreshFlush){ try{ await _refreshFlush; }catch(e){} }
  })().catch(e => { console.warn('sales: Retry now', e); });
  _erpCopyTry = run; renderErpNudge();
  try{ await run; }
  finally{
    _erpCopyTry = null;
    const up = erpCopyUp();
    _erpCopyTried = up ? Date.now() : 0;
    renderErpNudge();
    if(!up) showToast(unsaved && saved ? '✅ The sales changes are saved' : '✅ The sales figures are up to date with the cloud');
  }
}
function erpNudgeKeyNow(){ return [!!_loadFailed.erpSales, _erpBroken.length, erpCopyUp(), erpCopyWhy(), !!_erpCopyTry, _erpCopyTried, erpCopyLong()].join('|'); }
// The nudge drawn again only when what it shows changed: a refresh that takes nothing anew draws nothing (v126), and the
// card must still go once the cloud is read — 04-sync.js calls this at the end of every refresh.
function erpNudgeSync(){
  if(!currentUser || currentUser.role !== 'supervisor') return;
  if(erpNudgeKeyNow() !== _erpNudgeKey) renderErpNudge();
}
// New month: the two monthly inputs (this month's DSR, then the weekly sales
// file) are asked for explicitly — nothing rolls over unnoticed.
function monthInputsCard(){
  const stale = REPS.filter(r => targetStaleMonth(r));
  if(!stale.length) return '';
  const m = targetStaleMonth(stale[0]);
  return `<div class="card clickable" style="border-inline-start:4px solid var(--amber); margin-bottom:6px;" onclick="openErpImport()">
    <div style="font-weight:700; font-size:13.5px;">🗓️ ${monthLabel(todayStr().slice(0,7))} — the monthly inputs are needed</div>
    <div style="font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:3px;">The target shown now is from the file of <b>${esc(monthLabel(m))}</b>. Upload this month's DSR file (it sets the targets and the official figure), then the weekly sales file as usual. Visits and percentages start from zero by themselves on the first day of the month.</div>
  </div>`;
}
function renderErpNudge(){
  const el = document.getElementById('erpNudge');
  if(!el) return;
  if(currentUser.role !== 'supervisor'){ el.style.display = 'none'; return; }
  const health = erpHealthCard() + monthInputsCard();
  // the same card in the ERP import sheet, when it is open (11-erp.js)
  document.querySelectorAll('#modalInner [data-erp-health]').forEach(h => { h.innerHTML = erpHealthCard(); });
  _erpNudgeKey = erpNudgeKeyNow();
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

