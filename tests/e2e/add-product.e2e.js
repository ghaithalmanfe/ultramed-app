// Adding a product that joins the system (v130, the owner's request of 25 Nov: "I want to add a new product and, when
// it is added, it fits into my system the right way"). The sales files name products and brands as text — an invoice
// line finds its catalog product by name and brand, its selling guide by category, the order lines and the duplicate
// check by the item code and the barcode. On v129 "+ Add product" asked for a name, a free-text brand, a price and an
// image only: no category (the product was in no selling guide and in no clinic's sell guide), no item code, no
// barcode, a brand typed "tepe" made a second TePe group, and a save that did not land left the product on the screen.
//   A1  the sheet asks for the category, the product code and the barcode, and suggests what the system knows: the
//       names the sales files invoice that the catalog lacks, the catalog's brands, the categories (catalog + guides)
//   A2  a name the sales files invoice fills in the brand and the usual invoiced price, and says how many were sold
//   A3  a brand typed in another spelling is filed under the catalog's own ("tepe" → "TePe"), said under the field,
//       and the product lands in that one brand group
//   A4  a product code or a barcode another product has, a barcode that is not digits and a negative price are refused:
//       nothing is written, the field is named
//   A5  no category: asked first (nothing written), the second tap saves
//   A6  a name that says a catalog product another way is asked first ("tepe interdental-brush 0.45mm"); another size
//       ("0.5 mm") is not asked
//   A7  the product joins the system: the catalog in the cloud holds it with its code, category, barcode and price; the
//       Products list shows it under its brand; its page shows its category's selling guide; the selling guides count
//       it; the order form lists it; its invoices in the sales files reach it (the sell guide's lines carry its category)
//   A8  Edit product asks for the category and the barcode and saves them; a code another product has is refused;
//       two products that already share a code can still be edited
//   A9  a save that does not land adds nothing: not on the list, the sheet keeps what was typed, the words say so
//   A10 in Arabic: the sheet's words, notes and question are Arabic
//   A11 guard: no page errors
// Invented data, a fake cloud, a fixed clock (Tue 10 Nov 2026, 10:00). Port 8313. Env: WWW=<dir>
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const PORT = 8313, URL = `http://localhost:${PORT}/index.html`;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const cloud = {}; let failKey = null; const writes = [];
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { if(failKey === k) return false; writes.push(k); cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { if(entries.some(([k]) => k === failKey)) return false; entries.forEach(([k, v]) => { writes.push(k); cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined && !ok?'  → '+JSON.stringify(info).slice(0, 700):'')); if(!ok) failed++; }
const G = 'Dr. Ghaith', M = 'Mariam';
function seed(){
  Object.keys(cloud).forEach(k => { delete cloud[k]; });
  cloud.staff = JSON.stringify([{ name: M, role: 'rep', email: 'm@x.com' }, { name: G, role: 'supervisor', email: 'g@x.com' }]);
  cloud.clinics = JSON.stringify([{ id: 'a', name: 'Alpha Dental Center (invented)', rep: M, cls: 'A', doctors: [] }]);
  cloud.products = JSON.stringify([
    { id: 'TP-045', name: 'TePe Interdental Brush 0.45 mm', brand: 'TePe', cat: 'Interdental', barcode: '7317400012345', price: 1.2 },
    { id: 'PH-W2', name: 'Sonicare Brush Head W2', brand: 'Philips', cat: 'Brush heads', price: 9 },
    { id: 'SHR-1', name: 'Shared Code Gel A', brand: 'Sample Gels', cat: 'Gels', price: 3 },
    { id: 'SHR-1', name: 'Shared Code Gel B', brand: 'Sample Gels', cat: 'Gels', price: 4 },
  ]);
  cloud.categoryGuides = JSON.stringify({ Interdental: { sell: 'Lead with the size guide', how: '', objections: '', links: [] } });
  cloud.visits = '[]'; cloud.tasks = '[]'; cloud.events = '[]'; cloud.dayPlans = '{}'; cloud.erpMap = '{}';
  cloud.targets = JSON.stringify({ [M]: { revenue: 1000, month: '2026-11' } });
}
const H = ',Date,Type,,Invoice#,Date of Stock Issue,Stock Issue #,Code,Account,Customer Class,Code,AltCode,Product,Quantity,Sales Gross,Discount Sales,Sales Amount,Sales Return Amount,Discount. Sales Ret,Net Sales,Brand,Name,Remarks,';
const L = (d, inv, acct, qty, gross, product, brand, sm) => `,${d},SalesInvoice,Credit,${inv},${d},MIV${inv},001,${acct},Clinics,X1,01/1,"${product}",${qty},${gross},0,${gross},0,0,${gross},${brand},${sm},,`;
const CSV = [H,
  L('02/11/2026', 'SINV1', 'Alpha Dental Center (invented)', 10, 25, 'Curaprox CS 5460 Ultra Soft', 'Curaprox', 'Mariam Sample'),
  L('05/11/2026', 'SINV2', 'Alpha Dental Center (invented)', 4, 10, 'Curaprox CS 5460 Ultra Soft', 'Curaprox', 'Mariam Sample'),
  L('06/11/2026', 'SINV3', 'Alpha Dental Center (invented)', 6, 7.2, 'TePe Interdental Brush 0.45 mm', 'TEPE MARKETING', 'Mariam Sample'),
  L('08/11/2026', 'SINV4', 'Alpha Dental Center (invented)', 1, 2, 'Delivery charge', 'Delivery', 'Mariam Sample')].join('\n');
(async()=>{
  const server = http.createServer((req,res)=>{
    const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
    fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
  });
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const errors = [];
  const open = async (who, role, lang) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await blockFirebase(ctx);
    await ctx.route(u => !/^(http:\/\/localhost[:/]|data:|blob:)/.test(u.href), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: '+m.text()); });
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
    await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
    await page.exposeFunction('__cSetMany', api.setMany);
    await page.addInitScript(l => {
      window.storage = {
        get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
        set: async (k, v) => window.__cSet(k, v),
        setMany: async entries => window.__cSetMany(entries),
        delete: async k => window.__cDel(k),
        list: async p => ({ keys: await window.__cList(p) }),
      };
      if(l) try{ localStorage.setItem('ultramed_lang', l); }catch(e){}
      const off = new Date(2026, 10, 10, 10, 0, 0).getTime() - Date.now();
      const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
      const _si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => ms === 20000 ? -1 : _si(fn, ms, ...a);
    }, lang || null);
    await page.goto(URL); await page.waitForTimeout(200);
    await page.evaluate(async a => { await selectUser(a[0], a[1]); if(typeof msWhenReady === 'function') await msWhenReady(); }, [who, role]);
    await page.waitForTimeout(250);
    return { ctx, page };
  };
  const importSales = page => page.evaluate(async csv => { window.confirm = () => true; openErpImport(); await erpAutoImport(csv); await new Promise(r => setTimeout(r, 300));
    const b = [...document.querySelectorAll('button')].find(b => /Save & analyze/.test(b.textContent)); if(b) b.click(); await new Promise(r => setTimeout(r, 800)); try{ closeModal(); }catch(e){} }, CSV);
  const sheet = page => page.evaluate(() => ({ text: (document.getElementById('modalInner') || {}).innerText || '', ids: [...document.querySelectorAll('#modalInner input')].map(i => i.id) }));
  const typeIn = (page, id, v) => page.evaluate(a => { const el = document.getElementById(a[0]); el.value = a[1]; el.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
  const val = (page, id) => page.evaluate(i => (document.getElementById(i) || {}).value, id);
  const note = (page, id) => page.evaluate(i => ((document.getElementById(i) || {}).textContent || '').trim(), id);
  const save = async page => { const before = writes.length; await page.evaluate(() => submitAddProduct()); await page.waitForTimeout(250); return writes.slice(before); };
  const lastToast = page => page.evaluate(() => { const t = document.getElementById('toast'); return t ? t.textContent.trim() : ''; });
  const catalog = () => JSON.parse(cloud.products);
  try{
    seed();
    let { ctx, page } = await open(G, 'supervisor');
    await importSales(page);
    await page.evaluate(() => { switchView('products'); openAddProduct(); }); await page.waitForTimeout(100);
    // A1
    const a1 = await page.evaluate(() => ({
      ids: [...document.querySelectorAll('#modalInner input')].map(i => i.id),
      names: [...document.querySelectorAll('#mProdNames option')].map(o => o.value),
      brands: [...document.querySelectorAll('#mProdBrands option')].map(o => o.value),
      cats: [...document.querySelectorAll('#mProdCats option')].map(o => o.value),
      text: document.getElementById('modalInner').innerText }));
    check('A1 the sheet asks for the category, the product code and the barcode, and suggests the sales files\' names the catalog lacks, the brands and the categories',
      ['mProdName', 'mProdBrand', 'mProdCat', 'mProdCode', 'mProdBarcode', 'mProdPrice'].every(i => a1.ids.includes(i)) && /Category/.test(a1.text) && /Product code/.test(a1.text) && /Barcode/.test(a1.text)
        && a1.names.includes('Curaprox CS 5460 Ultra Soft') && !a1.names.includes('TePe Interdental Brush 0.45 mm') && !a1.names.some(n => /Delivery/.test(n))
        && a1.brands.includes('TePe') && a1.brands.includes('Philips') && a1.brands.includes('Curaprox') && !a1.brands.includes('TEPE MARKETING')
        && a1.cats.includes('Interdental') && a1.cats.includes('Brush heads') && a1.cats.includes('Gels'), a1);
    // A2
    await typeIn(page, 'mProdName', 'curaprox cs 5460 ultra soft');
    const a2 = { brand: await val(page, 'mProdBrand'), price: await val(page, 'mProdPrice'), note: await note(page, 'apNoteName') };
    check('A2 a name the sales files invoice fills in the brand and the usual invoiced price, and says how many were sold', a2.brand === 'Curaprox' && a2.price === '2.5' && /Sold 14 in the sales files, last/.test(a2.note) && /brand and price filled in/.test(a2.note), a2);
    // A5 — no category: asked first, the second tap saves
    let w = await save(page);
    const asked5 = await page.evaluate(() => (document.getElementById('apAsk') || {}).innerText || '');
    const wrote5 = w.filter(k => k === 'products').length;
    w = await save(page);
    const c5 = catalog().find(p => p.name === 'curaprox cs 5460 ultra soft');
    check('A5 no category: asked first (nothing written), the second tap saves', /No category/.test(asked5) && wrote5 === 0 && w.includes('products') && !!c5 && c5.brand === 'Curaprox' && c5.price === 2.5 && !c5.cat, { asked5, wrote5, w, c5 });
    // A3 + A7 — a full product: brand in another spelling, a category with a guide, a code, a barcode
    await page.evaluate(() => openAddProduct()); await page.waitForTimeout(80);
    await typeIn(page, 'mProdName', 'TePe Interdental Brush 0.5 mm');
    const like0 = await page.evaluate(() => UMCore.productAddCheck(addProdDraft(), productCheckCtx()).asks.map(a => a.kind));
    await typeIn(page, 'mProdBrand', 'tepe');
    await typeIn(page, 'mProdCat', 'interdental');
    await typeIn(page, 'mProdCode', 'TP-050');
    await typeIn(page, 'mProdBarcode', '7317400012352');
    await typeIn(page, 'mProdPrice', '1.25');
    const a3note = await note(page, 'apNoteBrand'), catNote = await note(page, 'apNoteCat');
    w = await save(page);
    const c7 = catalog().find(p => p.name === 'TePe Interdental Brush 0.5 mm');
    check('A3 a brand typed in another spelling is filed under the catalog\'s own ("tepe" → "TePe"), said under the field', /Filed under the catalog's brand “TePe”/.test(a3note) && c7 && c7.brand === 'TePe' && c7.cat === 'Interdental', { a3note, c7 });
    check('A6 another size ("0.5 mm" beside "0.45 mm") is not asked as a look-alike', !like0.includes('lookalike') && w.includes('products'), { like0, w });
    const a7 = await page.evaluate(() => {
      switchView('products');
      const list = document.getElementById('productListWrap').innerText;
      const groups = [...document.querySelectorAll('#productListWrap .brand-head')].map(h => h.dataset.brand);
      openProductDetail('TP-050'); const detail = document.getElementById('modalInner').innerText; closeModal();
      openCategoryGuides(); const guides = document.getElementById('modalInner').innerText; closeModal();
      openStandaloneOrder(); const s = document.getElementById('soProdSearch'); s.value = 'Brush 0.5'; renderSoProducts();
      const chips = document.getElementById('soProdChips').innerText; closeModal();
      const lines = UMCore.crossSellErpLines([{ customer: 'Alpha Dental Center (invented)', product: 'TePe Interdental Brush 0.5mm', brand: 'TEPE MARKETING', qty: 2, net: 2.5, gross: 2.5, date: '2026-11-09', type: 'invoice' }], () => ({ clinicId: 'a' }), products);
      return { list, groups, detail, guides, chips, line: lines[0] };
    });
    check('A7 the product joins the system: the cloud\'s catalog holds its code, category, barcode and price; one TePe group lists it; its page shows the Interdental guide; the guides count it; the order form lists it; its invoices reach its category',
      c7 && c7.id === 'TP-050' && c7.barcode === '7317400012352' && c7.price === 1.25 && /Has a selling guide/.test(catNote)
        && a7.groups.filter(b => /^tepe$/i.test(b)).length === 1 && /TePe Interdental Brush 0\.5 mm/.test(a7.list)
        && /Lead with the size guide/.test(a7.detail) && /Interdental/.test(a7.detail)
        && /Interdental[\s\S]{0,40}2 products/.test(a7.guides) && /TePe Interdental Brush 0\.5 mm/.test(a7.chips)
        && a7.line && a7.line.cat === 'Interdental' && a7.line.product === 'TePe Interdental Brush 0.5 mm', { line: a7.line, detail: a7.detail.slice(0, 400), list: a7.list.slice(0, 300) });
    // A6 — a look-alike name is asked first
    await page.evaluate(() => openAddProduct()); await page.waitForTimeout(80);
    await typeIn(page, 'mProdName', 'tepe interdental-brush 0.45mm');
    await typeIn(page, 'mProdBrand', 'TePe'); await typeIn(page, 'mProdCat', 'Interdental');
    w = await save(page);
    const asked6 = await page.evaluate(() => (document.getElementById('apAsk') || {}).innerText || '');
    check('A6 a name that says a catalog product another way is asked first, nothing written', /Looks like a product already in the catalog: “TePe Interdental Brush 0\.45 mm”/.test(asked6) && !w.includes('products'), { asked6, w });
    // A4 — refused: a code, a barcode, a bad barcode, a negative price
    const refuse = async (field, value, re) => {
      await page.evaluate(() => openAddProduct()); await page.waitForTimeout(60);
      await typeIn(page, 'mProdName', 'Refusal Probe Paste'); await typeIn(page, 'mProdCat', 'Gels'); await typeIn(page, field, value);
      const ww = await save(page); const t = await lastToast(page);
      return { ok: !ww.includes('products') && re.test(t) && !catalog().some(p => p.name === 'Refusal Probe Paste'), t };
    };
    const r1 = await refuse('mProdCode', 'tp-045', /product code is already used by TePe Interdental Brush 0\.45 mm/);
    const r2 = await refuse('mProdBarcode', '07317400012345', /barcode is already used by TePe Interdental Brush 0\.45 mm/);
    const r3 = await refuse('mProdBarcode', '12AB', /barcode is digits only/);
    const r4 = await refuse('mProdPrice', '-3', /price of 0 or more/);
    check('A4 a code or a barcode another product has, a barcode that is not digits and a negative price are refused, nothing written', r1.ok && r2.ok && r3.ok && r4.ok, { r1, r2, r3, r4 });
    // A9 — a save that does not land adds nothing; the sheet keeps what was typed
    await page.evaluate(() => openAddProduct()); await page.waitForTimeout(60);
    await typeIn(page, 'mProdName', 'Unlanded Probe Gel'); await typeIn(page, 'mProdCat', 'Gels'); await typeIn(page, 'mProdBrand', 'Sample Gels');
    failKey = 'products';
    await save(page);
    failKey = null;
    const a9 = await page.evaluate(() => ({ inList: products.some(p => p.name === 'Unlanded Probe Gel'), kept: (document.getElementById('mProdName') || {}).value, btn: (document.getElementById('apSave') || {}).disabled }));
    const t9 = await lastToast(page);
    check('A9 a save that does not land adds nothing: not on the list, the sheet keeps what was typed, the words say so', !a9.inList && a9.kept === 'Unlanded Probe Gel' && a9.btn === false && /Not saved|not saved|No answer/.test(t9) && !catalog().some(p => p.name === 'Unlanded Probe Gel'), { a9, t9 });
    await page.evaluate(() => closeModal());
    // A8 — Edit product
    const a8 = await page.evaluate(async () => {
      const out = {};
      openEditProduct('PH-W2');
      out.ids = [...document.querySelectorAll('#modalInner input')].map(i => i.id);
      document.getElementById('epCat').value = 'Power brush heads'; document.getElementById('epBarcode').value = '8710103123456';
      await saveEditProduct('PH-W2'); await new Promise(r => setTimeout(r, 250));
      openEditProduct('PH-W2'); document.getElementById('epCode').value = 'TP-045';
      const t0 = []; const st = window.showToast; window.showToast = m => { t0.push(m); st(m); };
      await saveEditProduct('PH-W2'); await new Promise(r => setTimeout(r, 150));
      window.showToast = st; out.refused = t0.join(' | ');
      try{ closeModal(); }catch(e){}
      const shared = products.find(p => p.name === 'Shared Code Gel A');
      openEditProduct(productKey(shared)); document.getElementById('epPrice').value = '3.5';
      await saveEditProduct(productKey(shared)); await new Promise(r => setTimeout(r, 250));
      return out;
    });
    const ph = catalog().find(p => p.name === 'Sonicare Brush Head W2'), sa = catalog().find(p => p.name === 'Shared Code Gel A');
    check('A8 Edit product asks for the category and the barcode and saves them; a code another product has is refused; a product sharing a code can still be edited',
      a8.ids.includes('epCat') && a8.ids.includes('epBarcode') && ph.cat === 'Power brush heads' && ph.barcode === '8710103123456' && ph.id === 'PH-W2'
        && /product code is already used by TePe Interdental Brush 0\.45 mm/.test(a8.refused) && sa.price === 3.5 && sa.id === 'SHR-1', { a8, ph, sa });
    await ctx.close();
    // A10 — Arabic
    ({ ctx, page } = await open(G, 'supervisor', 'ar'));
    await page.evaluate(() => { switchView('products'); openAddProduct(); }); await page.waitForTimeout(150);
    await typeIn(page, 'mProdName', 'Arabic Probe Gel');
    await typeIn(page, 'mProdBrand', 'Brandnewco');
    await page.waitForTimeout(150);
    await page.evaluate(() => submitAddProduct()); await page.waitForTimeout(250);
    const a10 = await page.evaluate(() => {
      const box = document.getElementById('modalInner');
      const notes = [...box.querySelectorAll('.ap-note, .ap-ask')].map(n => n.innerText.trim()).filter(Boolean);
      const labels = [...box.querySelectorAll('label')].map(l => l.innerText.trim());
      return { notes, labels, intro: (box.querySelector('.ap-intro') || {}).innerText || '' };
    });
    const eng = /[A-Za-z]{4,}/;
    check('A10 in Arabic: the sheet\'s labels, notes and question are Arabic (only the product and brand names stay as typed)',
      a10.labels.some(l => /كود المنتج/.test(l)) && a10.labels.some(l => /الباركود/.test(l)) && /ملفات المبيعات/.test(a10.intro)
        && a10.notes.some(n => /علامة تجارية جديدة/.test(n)) && a10.notes.some(n => /بلا فئة/.test(n))
        && a10.notes.every(n => !eng.test(n.replace(/Brandnewco|Arabic Probe Gel/g, ''))) && a10.labels.every(l => !eng.test(l.replace(/KD|URL/g, ''))), a10);
    await ctx.close();
    check('A11 guard: no page errors', errors.length === 0, errors.slice(0, 5));
  } catch(e){ check('harness ran without throwing', false, e.stack); }
  finally {
    await browser.close(); server.close();
    console.log(results.join('\n'));
    console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
    process.exit(failed ? 1 : 0);
  }
})();
