// Order form (v88): quantities typed straight into the box, 40% and custom discounts, both order flows.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const { WWW, launchOpts, salesFixture } = require('./_env.js');
const PORT = 8222;
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const server = http.createServer((req,res)=>{ const f = path.join(WWW, req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); res.end(d); }); });
const cloud = {};
const api = { get: async k => k in cloud ? cloud[k] : null, set: async (k, v) => { cloud[k] = v; return true; }, setMany: async e => { e.forEach(([k, v]) => { cloud[k] = v; }); return true; }, del: async k => { delete cloud[k]; return true; }, list: async p => Object.keys(cloud).filter(k => k.startsWith(p)) };
const results = []; let failed = 0;
function check(name, ok, info){ results.push((ok?'✅':'❌')+' '+name+(info!==undefined?'  → '+JSON.stringify(info).slice(0,400):'')); if(!ok) failed++; }
(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('**/gstatic.com/**', r => r.abort()); await ctx.route('**/.netlify/**', r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type()==='error' && !/gstatic|firebase|net::ERR|Failed to load resource/i.test(m.text())) errors.push('console: '+m.text().slice(0,200)); });
  page.on('dialog', d => d.accept());
  await page.exposeFunction('__cGet', api.get); await page.exposeFunction('__cSet', api.set); await page.exposeFunction('__cDel', api.del); await page.exposeFunction('__cList', api.list); await page.exposeFunction('__cSetMany', api.setMany);
  await page.addInitScript(() => { window.storage = { get: async k => { const v = await window.__cGet(k); return v == null ? null : { value: v }; }, set: async (k, v) => window.__cSet(k, v), setMany: async e => window.__cSetMany(e), delete: async k => window.__cDel(k), list: async p => ({ keys: await window.__cList(p) }) }; });
  await page.goto(`http://localhost:${PORT}/index.html`); await page.waitForTimeout(250);
  await page.evaluate(async () => { await selectUser('Mariam', 'rep'); }); await page.waitForTimeout(300);
  const setup = await page.evaluate(() => {
    const c = clinics.find(x => x.rep === 'Mariam' && x.cls !== 'Closed');
    if(!c.doctors || !c.doctors.length) c.doctors = [{ id: 'd-t', name: 'Dr. Test', title: '' }];
    const ps = products.filter(p => p.price > 0).slice(0, 2).map(p => ({ key: productKey(p), price: p.price, name: p.name }));
    switchView('log'); prepLogView(c.id); pickClinic(c.id); selectedDoctorIds = [c.doctors[0].id];
    ps.forEach(p => toggleProductChip(p.key)); setOrder(true);
    return { clinicId: c.id, ps, oid: draftOrders[0].id, inputs: document.querySelectorAll('#ordersContainer input.val').length, keypad: [...document.querySelectorAll('#ordersContainer input.val')].map(i => i.getAttribute('inputmode')) };
  });
  check('each product line has a typed quantity box with the numeric keypad', setup.inputs === 2 && setup.keypad.every(k => k === 'numeric'), setup);
  const box = page.locator(`#q-${setup.oid}-${await page.evaluate(k => slugify(k), setup.ps[0].key)}`);
  // type 12 (select-all on focus, so the old "1" is replaced), then Enter
  await box.click(); await box.fill('12'); await page.waitForTimeout(80);
  const live = await page.evaluate(() => ({ total: document.getElementById('orderTotalDisplay').textContent, focused: document.activeElement && document.activeElement.classList.contains('val') }));
  check('typing updates the totals live without losing focus', live.focused && live.total === (12*setup.ps[0].price + setup.ps[1].price).toFixed(2) + ' KD', { live, expected: (12*setup.ps[0].price + setup.ps[1].price).toFixed(2) });
  await box.press('Enter'); await page.waitForTimeout(100);
  const after = await page.evaluate((a) => ({ q: draftOrders[0].qty[a.ps[0].key], shown: document.getElementById('q-' + a.oid + '-' + slugify(a.ps[0].key)).value, minus: document.querySelector('#ordersContainer .stepper button').disabled }), setup);
  check('Enter settles the value (12) and redraws the row', after.q === 12 && after.shown === '12' && after.minus === false, after);
  // + and − still work on top of a typed value
  await page.evaluate((a) => { bumpQty(a.oid, a.ps[0].key, 1); bumpQty(a.oid, a.ps[0].key, -3); }, setup);
  check('+ / − still work on top of a typed value (12 → 13 → 10)', (await page.evaluate((a) => draftOrders[0].qty[a.ps[0].key], setup)) === 10);
  // garbage / negative / decimal / huge values are cleaned
  const cleaned = await page.evaluate((a) => { const out = []; for(const v of ['-4', '2.9', '99999', 'abc', '']){ setQty(a.oid, a.ps[1].key, v); out.push(draftOrders[0].qty[a.ps[1].key]); } setQty(a.oid, a.ps[1].key, '3'); return out; }, setup);
  check('bad input is cleaned: negative→0, decimal→whole, huge→9999, letters→0, empty→0', JSON.stringify(cleaned) === JSON.stringify([0, 2, 9999, 0, 0]), cleaned);
  // a typed 0 drops the item from the saved order; 40% chip applies
  const disc = await page.evaluate((a) => { setDraftDiscount(a.oid, 40); const chips = [...document.querySelectorAll('#ordersContainer .disc-chips .chip')].map(c => c.textContent); const on = document.querySelector('#ordersContainer .disc-chips .chip.on').textContent; const gross = orderGross(draftOrders[0]); return { chips, on, gross, net: orderNet(draftOrders[0]), pct: draftOrders[0].discountPct }; }, setup);
  check('40% chip exists and applies (net = 60% of gross)', disc.chips.includes('40%') && disc.on === '40%' && disc.pct === 40 && Math.abs(disc.net - disc.gross*0.6) < 0.005, disc);
  const other = await page.evaluate((a) => { const inp = document.querySelector('#ordersContainer .disc-other'); inp.value = '12.5'; inp.dispatchEvent(new Event('change')); return { pct: draftOrders[0].discountPct, shown: document.querySelector('#ordersContainer .disc-other').value, anyChipOn: !!document.querySelector('#ordersContainer .disc-chips .chip.on') }; }, setup);
  check('any other percentage can be typed (12.5%) and stays shown', other.pct === 12.5 && other.shown === '12.5' && !other.anyChipOn, other);
  await page.evaluate((a) => { setDraftDiscount(a.oid, 40); setQty(a.oid, a.ps[1].key, '0'); }, setup);
  const saved = await page.evaluate(async (a) => { window._lastVisitSaveAt = 0; await saveVisit(); const v = visits[visits.length - 1]; return { items: v.orderItems, gross: v.orderGross, total: v.orderTotal, disc: v.orders[0].discountPct, cloud: JSON.parse(await (await window.storage.get('visits')).value).slice(-1)[0].orderTotal }; }, setup);
  const expGross = 10 * setup.ps[0].price;
  check('saved visit: only the non-zero line, 40% discount, totals to the cent, same in the cloud', saved.items.length === 1 && saved.items[0].qty === 10 && saved.disc === 40 && Math.abs(saved.gross - expGross) < 0.005 && Math.abs(saved.total - expGross*0.6) < 0.005 && saved.cloud === saved.total, { saved, expGross });
  // phone order flow: typed quantity, 40% chip
  const so = await page.evaluate(async (a) => {
    openStandaloneOrder ? openStandaloneOrder() : openPhoneOrder();
    await new Promise(r => setTimeout(r, 100));
    const chips = [...document.querySelectorAll('#modalInner .chip')].map(c => c.textContent);
    return { has40: chips.includes('40%') };
  }, setup).catch(e => ({ err: e.message }));
  check('phone-order form offers 40% too', so.has40 === true, so);
  // ---- the tap right after typing must not be swallowed (blur → no rebuild) ----
  await page.evaluate((a) => { closeModal(); switchView('log'); prepLogView(a.clinicId); pickClinic(a.clinicId); selectedDoctorIds = [clinics.find(c=>c.id===a.clinicId).doctors[0].id]; a.ps.forEach(p => toggleProductChip(p.key)); setOrder(true); }, setup);
  const oid2 = await page.evaluate(() => draftOrders[0].id);
  const slug0 = await page.evaluate(k => slugify(k), setup.ps[0].key);
  const b0 = page.locator(`#q-${oid2}-${slug0}`);
  await b0.tap(); await b0.fill('7');
  await page.locator(`#q-${oid2}-${slug0}`).locator('xpath=following-sibling::button[1]').tap(); await page.waitForTimeout(80);
  const tap1 = await page.evaluate((a) => ({ q: draftOrders[0].qty[a[0]], shown: document.getElementById('q-'+a[1]+'-'+a[2]).value, total: document.getElementById('orderTotalDisplay').textContent }), [setup.ps[0].key, oid2, slug0]);
  check('type 7 then tap + straight away → 8 (the tap is not swallowed)', tap1.q === 8 && tap1.shown === '8', tap1);
  await b0.tap(); await b0.fill('3');
  await page.locator('#ordersContainer .disc-chips .chip', { hasText: '40%' }).tap(); await page.waitForTimeout(80);
  const tap2 = await page.evaluate((k) => ({ q: draftOrders[0].qty[k], pct: draftOrders[0].discountPct, on: (document.querySelector('#ordersContainer .disc-chips .chip.on')||{}).textContent }), setup.ps[0].key);
  check('type 3 then tap the 40% chip straight away → both land', tap2.q === 3 && tap2.pct === 40 && tap2.on === '40%', tap2);
  const otherBox = page.locator('#ordersContainer .disc-other');
  await otherBox.tap(); await otherBox.fill('12.5');
  await page.locator('#ordersContainer .disc-chips .chip', { hasText: '20%' }).tap(); await page.waitForTimeout(80);
  const tap3 = await page.evaluate(() => ({ pct: draftOrders[0].discountPct, on: (document.querySelector('#ordersContainer .disc-chips .chip.on')||{}).textContent, otherVal: document.querySelector('#ordersContainer .disc-other').value, otherOn: document.querySelector('#ordersContainer .disc-other').classList.contains('on') }));
  check('type 12.5 in Other then tap the 20% chip → 20% wins, Other box cleared', tap3.pct === 20 && tap3.on === '20%' && tap3.otherVal === '' && !tap3.otherOn, tap3);
  await otherBox.tap(); await otherBox.fill('12.5'); await otherBox.press('Enter'); await page.waitForTimeout(60);
  const tap4 = await page.evaluate(() => ({ pct: draftOrders[0].discountPct, otherOn: document.querySelector('#ordersContainer .disc-other').classList.contains('on'), chipOn: !!document.querySelector('#ordersContainer .disc-chips .chip.on'), bg: getComputedStyle(document.querySelector('#ordersContainer .disc-other')).fontWeight }));
  check('a typed 12.5% shows as the selected discount (box lit, no chip lit)', tap4.pct === 12.5 && tap4.otherOn && !tap4.chipOn && tap4.bg === '700', tap4);
  // typed 0 then tap the next box: first box settles to 0 with − disabled, second box focused
  const slug1 = await page.evaluate(k => slugify(k), setup.ps[1].key);
  await b0.tap(); await b0.fill('0'); await page.locator(`#q-${oid2}-${slug1}`).tap(); await page.waitForTimeout(60);
  const tap5 = await page.evaluate((a) => ({ q: draftOrders[0].qty[a[0]], minusDisabled: document.getElementById('q-'+a[1]+'-'+a[2]).previousElementSibling.disabled, focusedSecond: document.activeElement && document.activeElement.id === 'q-'+a[1]+'-'+a[3] }), [setup.ps[0].key, oid2, slug0, slug1]);
  check('type 0 then tap the next box → − disabled in place, next box focused', tap5.q === 0 && tap5.minusDisabled && tap5.focusedSecond, tap5);
  // phone order: clear a quantity and leave → the line goes, nothing stale is saved
  const so2 = await page.evaluate(async (a) => {
    openStandaloneOrder(a.clinicId); await new Promise(r => setTimeout(r, 100));
    toggleSoProduct(a.ps[0].key); toggleSoProduct(a.ps[1].key);
    const inp = document.querySelector('#soQtyWrap input'); inp.focus(); inp.value = '5'; inp.dispatchEvent(new Event('input'));
    inp.value = ''; inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new Event('change')); inp.blur();
    return { items: Object.assign({}, soItems), rows: document.querySelectorAll('#soQtyWrap .qty-row').length, chipsOn: document.querySelectorAll('#soProdChips .chip.on').length, total: document.getElementById('soTotal').innerText.replace(/\s+/g,' ') };
  }, setup);
  check('phone order: a cleared quantity drops the line (nothing stale saved), chip unlit, total updated', Object.keys(so2.items).length === 1 && so2.rows === 1 && so2.chipsOn === 1 && so2.total.includes((setup.ps[1].price).toFixed(2)), so2);
  check('no page errors', errors.length === 0, errors.slice(0, 4));
  console.log(results.join('\n')); console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  await browser.close(); server.close();
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
