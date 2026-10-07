// Missing from the catalog: the Intensiv handpieces and Ortho-Strips, and any
// product sold in the ERP files under a brand the catalog lacks, offered to the
// supervisor on the Products screen and added only on tap — a failed save adds
// nothing; services (inspection fees) never appear; reps never see the note.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, blockFirebase } = require('./_env.js');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{
  const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); });
});
const cloud = {}; let failKey = null;
const api = {
  get: async k => k in cloud ? cloud[k] : null,
  set: async (k, v) => { if(failKey === k) return false; cloud[k] = v; return true; },
  del: async k => { delete cloud[k]; return true; },
  list: async p => Object.keys(cloud).filter(k => k.startsWith(p)),
  setMany: async entries => { entries.forEach(([k, v]) => { cloud[k] = v; }); return true; },
};
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info):'')); if(!ok) failed++; }
const G = 'Dr. Ghaith', M = 'Mariam';

(async()=>{
  await new Promise(r=>server.listen(8203,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext();
  await blockFirebase(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR/i.test(m.text())) errors.push('console: '+m.text()); });
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set);
  await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list);
  await page.exposeFunction('__cSetMany', api.setMany);
  await page.addInitScript(() => {
    window.storage = {
      get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; },
      set: async (k, v) => window.__cSet(k, v),
      setMany: async entries => window.__cSetMany(entries),
      delete: async k => window.__cDel(k),
      list: async p => ({ keys: await window.__cList(p) }),
    };
    const off = new Date(2026, 9, 8, 10, 0, 0).getTime() - Date.now(); // 28 Sep 2026, ticking
    const _D = Date; class FakeDate extends _D { constructor(...a){ if(a.length === 0) super(_D.now() + off); else super(...a); } static now(){ return _D.now() + off; } static parse(s){ return _D.parse(s); } static UTC(...a){ return _D.UTC(...a); } } window.Date = FakeDate;
  });
  cloud.staff = JSON.stringify([{name:M, role:'rep', email:'m@x.com'}, {name:G, role:'supervisor', email:'g@x.com'}]);
  cloud.clinics = JSON.stringify([{id:'a', name:'Alpha Dental Center', rep:M, cls:'A', doctors:[]}]);
  cloud.products = JSON.stringify([{id:'p1', name:'Sonicare 4100', brand:'Philips', price:49, cat:'Power toothbrush'}, {id:'OS40M-DS/3', name:'Old Intensiv strip', brand:'Intensiv', price:35}]);
  const H = ',Date,Type,,Invoice#,Date of Stock Issue,Stock Issue #,Code,Account,Customer Class,Code,AltCode,Product,Quantity,Sales Gross,Discount Sales,Sales Amount,Sales Return Amount,Discount. Sales Ret,Net Sales,Brand,Name,Remarks,';
  const L = (d, inv, acct, qty, gross, product, brand, sm) => `,${d},SalesInvoice,Credit,${inv},${d},MIV${inv},001,${acct},Clinics,X1,01/1,"${product}",${qty},${gross},0,${gross},0,0,${gross},${brand},${sm},,`;
  const csv = [H,
    L('01/10/2026','SINV1','Alpha Dental Center',2,70,'OS80XC Intensiv Ortho-Strips Coarse, Double-Sided REDUCTION','Intensiv','Mariam Zohair'),
    L('02/10/2026','SINV2','Alpha Dental Center',1,380,'WG-69 A, Intensiv Swingle, W&H Synea, without light','Intensiv','Mariam Zohair'),
    L('03/10/2026','SINV3','Alpha Dental Center',3,27,'Bio Gel A','B&L Biotech','Mariam Zohair'),
    L('04/10/2026','SINV4','Alpha Dental Center',1,48,'Inspection Fee for Intensiv Handpiece','Maintenance','Mariam Zohair'),
    L('05/10/2026','SINV5','Alpha Dental Center',1,49,'Sonicare 4100 White','Philips Export BV','Mariam Zohair')].join('\n');
  await page.goto('http://localhost:8203/index.html'); await page.waitForTimeout(300);
  await page.evaluate(async () => { await selectUser('Dr. Ghaith', 'supervisor'); }); await page.waitForTimeout(250);
  await page.evaluate(async (csv) => { window.confirm = () => true; openErpImport(); await erpAutoImport(csv); await new Promise(r => setTimeout(r, 300));
    const b = [...document.querySelectorAll('button')].find(b => /Save & analyze/.test(b.textContent)); if(b) b.click(); await new Promise(r => setTimeout(r, 800)); try{ closeModal(); }catch(e){} }, csv);
  let txt = await page.evaluate(() => { switchView('products'); return document.getElementById('productListWrap').innerText.replace(/\s+/g, ' '); });
  check('Products shows the supervisor what the catalog is missing: 14 Intensiv (one is in by its code) + 1 B&L Biotech', /15 products missing from the catalog/.test(txt) && /B&L Biotech \(1\) · Intensiv \(14\)/.test(txt), txt.slice(0, 200));
  txt = await page.evaluate(() => { openCatalogGaps(); return document.querySelector('#modalBack').innerText.replace(/\s+/g, ' '); });
  check('the review lists the handpiece and the strips with prices and what was sold; never the inspection fee', /WG-69 A, Intensiv Swingle, W&H Synea, without light/.test(txt) && /380\.00 KD/.test(txt) && /OS80XC Intensiv Ortho-Strips Coarse, Double-Sided REDUCTION/.test(txt) && /2 sold in the files/.test(txt) && /Bio Gel A/.test(txt) && /9\.00 KD/.test(txt) && !/Inspection Fee/.test(txt) && !/Sonicare 4100 White/.test(txt), txt.slice(0, 900));
  // a save that fails adds nothing
  failKey = 'products';
  await page.evaluate(async () => { await addCatalogGaps(); });
  check('a failed save adds nothing and says so', JSON.parse(cloud.products).length === 2 && await page.evaluate(() => products.length) === 2 && await page.evaluate(() => /Not saved/.test(document.body.innerText)));
  failKey = null;
  // untick B&L, add the rest
  await page.evaluate(async () => { document.querySelectorAll('.cgap').forEach(x => { if(/Bio Gel/.test(x.closest('label').innerText)) x.checked = false; }); await addCatalogGaps(); });
  const cat = JSON.parse(cloud.products);
  const sw = cat.find(p => p.name === 'WG-69 A, Intensiv Swingle, W&H Synea, without light');
  check('14 Intensiv products saved with code, price and category; the unticked one not', cat.length === 16 && cat.filter(p => p.brand === 'Intensiv').length === 15 && sw && sw.id === 'WG-69 A' && sw.price === 380 && sw.cat === 'IPR Handpiece' && !cat.some(p => p.name === 'Bio Gel A'), cat.length);
  txt = await page.evaluate(() => document.getElementById('productListWrap').innerText.replace(/\s+/g, ' '));
  check('the list now shows Intensiv; the note shows only what is left (1)', /Intensiv \(16\)|Intensiv \(15\)/.test(txt) && /1 product missing from the catalog/.test(txt) && /OS80XC Intensiv Ortho-Strips/.test(txt), txt.slice(0, 300));
  // a rep never sees the note
  await page.evaluate(async () => { await selectUser('Mariam', 'rep'); }); await page.waitForTimeout(250);
  txt = await page.evaluate(() => { switchView('products'); return document.getElementById('productListWrap').innerText; });
  check('a rep sees the Intensiv products but not the supervisor note', /Intensiv/.test(txt) && !/missing from the catalog/.test(txt));
  check('no page errors', errors.length === 0, errors);
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
