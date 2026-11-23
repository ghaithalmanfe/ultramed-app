// modal, bottom sheet, language, nudges, keyboard, boot
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- MODAL ----
function showModal(html){
  const inner = document.getElementById('modalInner');
  document.getElementById('modalContent').style.transform = ''; // clear any leftover drag offset
  inner.innerHTML = html;
  // Whole-Arabic sheets (data repair, month reports, doctor tools) read
  // right-to-left; detect from the first strong characters of the content.
  const txt = inner.textContent || '';
  const arabic = (txt.match(/[؀-ۿﭐ-﷿ﹰ-﻿]/g)||[]).length;
  const latin = (txt.match(/[A-Za-z]/g)||[]).length;
  inner.setAttribute('dir', (uiLang==='ar' || arabic > latin) ? 'rtl' : 'ltr');
  modalFrame(inner);
  document.getElementById('modalBack').classList.add('show');
}
// The sheet frame (component layer): a sheet that opens with its <h3> gets the header — an icon tile (the heading's
// own icon, else data-ic, else a neutral one) and the title — and the buttons it ends with become its foot (full
// width on the phone; at the end side on a laptop, the main action last). Nodes are moved, never rewritten: ids,
// handlers and texts stay as the sheet wrote them.
function modalSections(inner){
  const kids = Array.from(inner.children).filter(k => !k.classList.contains('modal-foot'));
  while(kids.length && kids[kids.length - 1].tagName === 'BUTTON' && kids[kids.length - 1].classList.contains('btn')) kids.pop();   // the buttons it ends with become its foot
  if(kids.length < 2) return;
  const head = el => el.tagName === 'P' || el.classList.contains('badge') || (el.children.length > 0 && Array.from(el.children).every(c => c.classList.contains('badge')))
    || (el.tagName === 'DIV' && !el.children.length && el.textContent.trim().length > 0 && el.textContent.trim().length < 90);   // a short line under the title (a brand, a clinic)
  let i = Math.max(0, kids.findIndex(k => k.matches('[data-sections]') || k.querySelector(':scope > [data-sections]'))) + 1;
  while(i < kids.length && head(kids[i])) i++;
  let cur = null;
  for(let k = i; k < kids.length; k++){
    const el = kids[k];
    if(!cur || el.classList.contains('section-title')){ cur = document.createElement('section'); cur.className = 'cd-sec'; inner.insertBefore(cur, el); }
    cur.appendChild(el);
  }
}
function modalFrame(inner){
  try{
    { const mc = document.getElementById('modalContent'); if(mc){ mc.classList.toggle('m-wide', !!inner.querySelector(':scope > [data-wide]')); mc.classList.toggle('m-grid', !!inner.querySelector(':scope > [data-grid]')); } }
    const h = inner.firstElementChild;
    if(h && h.tagName === 'H3' && !h.classList.contains('mh')){
      h.classList.add('mh');
      // an emoji that led the title ("⚠️ …") gives way to the tile's line icon when the sheet names one (data-ic)
      if(h.dataset.ic && h.firstChild && h.firstChild.nodeType === 3) h.firstChild.nodeValue = h.firstChild.nodeValue.replace(/^\s*(?:\p{Extended_Pictographic}|[\u2600-\u27BF\uFE0F\u200D])+\s*/u, '');
      const tile = document.createElement('span'); tile.className = 'mh-ic' + (h.dataset.tone ? ' ' + h.dataset.tone : ''); tile.setAttribute('aria-hidden', 'true');
      const lead = h.firstChild && h.firstChild.nodeType === 3 && !h.firstChild.nodeValue.trim() ? h.firstChild.nextSibling : h.firstChild;
      if(lead && lead.nodeType === 1 && lead.matches('svg.svgi')) tile.appendChild(lead); else tile.innerHTML = I(h.dataset.ic || 'file');
      const t = document.createElement('span'); t.className = 'mh-t';
      while(h.firstChild) t.appendChild(h.firstChild);
      h.appendChild(tile); h.appendChild(t);
    }
    // a sheet that asks for it (data-sections): its header stays, the rest becomes cards — one per section title
    { const mc = document.getElementById('modalContent'), secs = !!inner.querySelector(':scope > [data-sections], :scope > * > [data-sections]'); if(mc) mc.classList.toggle('m-secs', secs); if(secs) modalSections(inner); }
    if(!inner.querySelector(':scope > .modal-foot')){
      const kids = Array.from(inner.children); let i = kids.length;
      while(i > 0 && kids[i - 1].tagName === 'BUTTON' && kids[i - 1].classList.contains('btn') && !kids[i - 1].classList.contains('small')) i--;
      const tail = kids.slice(i);
      if(tail.length && tail.length <= 3 && i > 0){ const foot = document.createElement('div'); foot.className = 'modal-foot'; inner.appendChild(foot); tail.forEach(b => foot.appendChild(b)); }
    }
  }catch(e){ console.error('sheet frame', e); }
}
function closeModal(){ document.getElementById('modalBack').classList.remove('show'); }
// ---- Long lists in pages (v126 speed, part 4) ----
// A long list — the Doctors list, the clinic analysis' clinics, the coverage review's clinics — draws its first rows,
// then "Show N more"; its counts, search and filters are worked out over the whole list as before (the caller's), only
// the drawing of the rest waits for the tap. A tap adds the next rows of the very list on screen (the one this draw was
// of: a refresh that changes the data draws the list again). How many rows are shown is kept per list while what picks
// them (its filters, search, person, window) is the same; another pick starts from the first page.
const PAGE_ROWS = { dd: 60, ca: 20, covV: 30, covN: 30 };
const _pages = Object.create(null); // list → { key, n, items, row }
function pagedRows(list, key, items, row){
  const p = _pages[list] && _pages[list].key === key ? _pages[list] : { key, n: PAGE_ROWS[list] };
  p.items = items; p.row = row; _pages[list] = p;
  const n = Math.min(p.n, items.length);
  return items.slice(0, n).map(row).join('') + pageMoreHTML(list, n, items.length);
}
function pageMoreHTML(list, shown, total){
  if(shown >= total) return '';
  return `<div class="pg-more" data-list="${list}"><button type="button" class="btn secondary" onclick="pageMore('${jsArg(list)}', this)">Show ${Math.min(PAGE_ROWS[list], total - shown)} more (${total - shown} not shown yet)</button></div>`;
}
function pageMore(list, btn){
  const p = _pages[list], wrap = btn && btn.closest('.pg-more');
  if(!p || !p.items || !wrap) return;
  const from = Math.min(p.n, p.items.length), to = Math.min(from + PAGE_ROWS[list], p.items.length);
  p.n = to;
  wrap.insertAdjacentHTML('beforebegin', p.items.slice(from, to).map(p.row).join(''));
  const next = pageMoreHTML(list, to, p.items.length);
  if(next) wrap.outerHTML = next; else wrap.remove();
}
function closeModalBg(e){ if(e.target.id==='modalBack') closeModal(); }

if('serviceWorker' in navigator){
  // Registering on window 'load' misses the event entirely on this page: the
  // blocking Firebase SDK <script> tags in <head> can delay this inline
  // script past the point 'load' already fired, so the listener never runs.
  const registerSW = () => navigator.serviceWorker.register('sw.js').catch(e=>console.error('SW register failed', e));
  if(document.readyState === 'complete') registerSW();
  else window.addEventListener('load', registerSW);
}
// Poll for changes made by other reps/devices so data stays reasonably fresh
// without a full realtime-listener rewrite of every render call. The same one
// path runs every 20 seconds and once when the app comes back on screen (v123:
// a phone woken from the pocket showed data as old as its last refresh), and
// never while a refresh is still on its way (loadAll is one at a time).
async function bgRefresh(){
  // Never refresh underneath a sales upload or a sales save in flight.
  // Sales edits the cloud has not confirmed (_erpDirty) do NOT stop the
  // refresh: loadAll keeps that copy in memory by itself, and the team's
  // visits, clinics and plans — and this phone's queued offline saves —
  // must keep moving meanwhile (v121: the flag froze them until reload).
  if(typeof _erpImporting !== 'undefined' && (_erpImporting || _erpSaving)) return;
  if(refreshRunning() || _roundBusy) return;
  if(earlyUnconfirmed()) return; // the early open: no cloud read before the sign-in is confirmed (v126 speed, part 3; 04-sync.js)
  if(currentUser && document.visibilityState==='visible'){
    _roundBusy = true;
    try{
      // Queued offline edits go up first (the delete log, then each list the
      // round may send), then the refresh — EVERY round (round 3). Until then a
      // round that left anything queued skipped the refresh, ~5 minutes at a
      // time: a list that keeps waiting (the rules refuse it, it is too large
      // for the cloud, no answer) froze every other list on this phone. A queued
      // list loses nothing to the refresh: it is served from this phone's copy
      // (cloudGet, loadVisits; from memory when that copy could not be written)
      // until it is sent. The refresh ends by sending what is still queued
      // (loadAllNow): the round is over only once that is done too, and a round
      // never starts while the last one is still on its way (_roundBusy) — a
      // phone closed right after a round leaves nothing of it half-sent.
      if(outboxList().length) await flushOutbox();
      await loadAll(); // (its read of chat and memories, while their screen is open, draws them when they changed: teamRead)
      if(_refreshFlush){ try{ await _refreshFlush; }catch(e){} }
    } finally { _roundBusy = false; }
  }
}
let _roundBusy = false;
if(FIREBASE_ENABLED){
  setInterval(bgRefresh, 20000);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && currentUser && _bootLoaded) bgRefresh(); });
}
// ---- Bottom-sheet drag-to-dismiss ----
// The sheet already looks draggable (it has a handle); make the gesture real.
(function(){
  const sheet = document.getElementById('modalContent');
  let startY = null, delta = 0, dragging = false;
  function insideInnerScroller(el){
    for(let n = el; n && n !== sheet; n = n.parentElement){
      const oy = getComputedStyle(n).overflowY;
      if((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return true;
    }
    return false;
  }
  function settle(){ dragging = false; startY = null; sheet.style.transition = 'transform .22s ease'; sheet.style.transform = ''; setTimeout(()=>{ sheet.style.transition=''; }, 240); }
  sheet.addEventListener('touchstart', e=>{
    if(sheet.scrollTop > 0) return; // only when the sheet content is at its top
    if(insideInnerScroller(e.target)) return; // a scrolling list inside the sheet is not a drag
    startY = e.touches[0].clientY; delta = 0; dragging = true;
    sheet.style.transition = 'none';
  }, {passive:true});
  sheet.addEventListener('touchcancel', ()=>{ if(dragging) settle(); });
  sheet.addEventListener('touchmove', e=>{
    if(!dragging || startY===null) return;
    delta = e.touches[0].clientY - startY;
    sheet.style.transform = delta > 0 ? `translateY(${delta}px)` : '';
  }, {passive:true});
  sheet.addEventListener('touchend', ()=>{
    if(!dragging) return;
    dragging = false; startY = null;
    sheet.style.transition = 'transform .22s ease';
    if(delta > 110){
      sheet.style.transform = 'translateY(105%)';
      setTimeout(()=>{ closeModal(); sheet.style.transform=''; sheet.style.transition=''; }, 190);
    } else {
      sheet.style.transform = '';
      setTimeout(()=>{ sheet.style.transition=''; }, 240);
    }
  });
})();

// ---- Language (English / Arabic) ----
// The interface is translated after it renders: every text node, placeholder
// and label is looked up in the dictionary by its exact English wording, so no
// screen had to be rewritten. Anything the team typed — clinic names, notes,
// products — is data and is never touched (it is marked dir="auto").
function setUiLang(lang){
  const next = lang === 'ar' ? 'ar' : 'en';
  if(next === uiLang){ closeModal(); return; }
  try{ localStorage.setItem('ultramed_lang', next); }catch(e){}
  // Going back to English means re-rendering from the source strings.
  if(next === 'en'){ location.reload(); return; }
  uiLang = next;
  applyLangChrome();
  closeModal();
  if(currentUser) renderAll();          // repaint so dates and generated text follow the language
  else renderGate();
  translateTree(document.body);
  showToast('✅ تم التبديل إلى العربية');
}
function applyLangChrome(){
  document.documentElement.lang = uiLang;
  document.documentElement.dir = uiLang === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('ar', uiLang === 'ar');
  const lt = document.getElementById('topLangTx');   // the top bar's language button names the other language
  if(lt) lt.textContent = uiLang === 'ar' ? 'EN' : 'ع';
}
function toggleUiLang(){ setUiLang(uiLang === 'ar' ? 'en' : 'ar'); }
function trOf(text){ return (uiLang === 'ar' && window.UMI18N) ? UMI18N.tr(text) : null; }
const TR_SKIP = '[dir="auto"], [data-notr], script, style, textarea, option:not([value]), .proreport';
function translateTree(root){
  if(uiLang !== 'ar' || !window.UMI18N || !root) return;
  if(root.nodeType === 3){ translateTextNode(root); return; }
  if(root.nodeType !== 1) return;
  if(root.closest && root.closest('[data-notr], .proreport')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n){
      if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if(!p || (p.closest && p.closest(TR_SKIP))) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  for(let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  nodes.forEach(translateTextNode);
  const attrs = root.querySelectorAll ? root.querySelectorAll('[placeholder],[aria-label],[title]') : [];
  attrs.forEach(el=>{
    if(el.closest('[data-notr], .proreport')) return;
    ['placeholder','aria-label','title'].forEach(a=>{
      const v = el.getAttribute(a);
      const hit = v ? trOf(v) : null;
      if(hit) el.setAttribute(a, hit);
    });
  });
  if(root.matches && root.matches('[placeholder],[aria-label],[title]')){
    ['placeholder','aria-label','title'].forEach(a=>{
      const v = root.getAttribute(a);
      const hit = v ? trOf(v) : null;
      if(hit) root.setAttribute(a, hit);
    });
  }
}
function translateTextNode(n){
  const raw = n.nodeValue, t = raw.trim();
  const hit = trOf(t);
  if(hit && hit !== t) n.nodeValue = raw.replace(t, hit);
}
// Anything rendered from here on is translated as it appears — armed always,
// so switching language mid-session works without a reload.
new MutationObserver(muts=>{
  if(uiLang !== 'ar') return;
  muts.forEach(m=>m.addedNodes.forEach(n=>translateTree(n)));
}).observe(document.documentElement, {childList:true, subtree:true});
if(uiLang === 'ar'){
  applyLangChrome();
  if(document.body) translateTree(document.body);
}

// ---- Dismissible explainer nudges ----
// The per-view explainer banners earn their keep the first few opens, then
// become noise; a dismissal is a device-level preference, so plain
// localStorage (not the synced store) is the right home for it.
(function(){
  let dismissed = {};
  try{ dismissed = JSON.parse(localStorage.getItem('ultramed_nudges_dismissed')||'{}'); }catch(e){}
  document.querySelectorAll('.nudge[data-nudge]').forEach(n=>{
    const id = n.getAttribute('data-nudge');
    if(dismissed[id]){ n.remove(); return; }
    const x = document.createElement('button');
    x.className = 'nudge-x'; x.setAttribute('aria-label','Dismiss tip'); x.textContent = '×';
    x.onclick = ()=>{
      dismissed[id] = true;
      try{ localStorage.setItem('ultramed_nudges_dismissed', JSON.stringify(dismissed)); }catch(e){}
      n.remove();
    };
    n.appendChild(x);
  });
})();

// ---- Keyboard accessibility ----
// Most interactive elements are template-rendered divs; rather than touching
// every template, anything carrying an onclick handler becomes focusable and
// activatable with Enter/Space. New nodes are enhanced as views re-render.
(function(){
  const SKIP_TAGS = new Set(['BUTTON','A','INPUT','SELECT','TEXTAREA','SUMMARY','LABEL','OPTION']);
  const SKIP_IDS = new Set(['modalBack','lightbox']); // backdrops close on click but are not buttons
  const INTERACTIVE = 'button, a[href], input, select, textarea, [onclick], [tabindex]';
  function reflectState(el){
    if(el.classList.contains('task-check') || el.classList.contains('plan-check')){
      el.setAttribute('role','checkbox');
      el.setAttribute('aria-checked', el.classList.contains('checked') || el.classList.contains('done') ? 'true' : 'false');
    } else if(el.classList.contains('chip') || el.classList.contains('dt') || el.classList.contains('t2')){
      el.setAttribute('aria-pressed', el.classList.contains('on') ? 'true' : 'false');
    }
  }
  function apply(el){
    if(SKIP_IDS.has(el.id) || el.hasAttribute('data-kbd')) return;
    if(el.tagName === 'A' && !el.hasAttribute('href')){ el.setAttribute('tabindex','0'); el.setAttribute('role','link'); el.setAttribute('data-kbd','1'); return; }
    if(SKIP_TAGS.has(el.tagName)) return;
    // a handler that only stops propagation is plumbing, not a control
    if(/^\s*event\.stopPropagation\(\)\s*;?\s*$/.test(el.getAttribute('onclick')||'')) return;
    el.setAttribute('data-kbd','1');
    if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
    // a card that contains its own buttons stays focusable + Enter-activatable,
    // but must not claim role=button (nested interactive content)
    if(!el.hasAttribute('role') && !el.querySelector(INTERACTIVE)) el.setAttribute('role','button');
    reflectState(el);
  }
  function enhance(root){
    if(!root || root.nodeType!==1) return;
    if(root.matches && root.matches('[onclick]')) apply(root);
    if(root.querySelectorAll) root.querySelectorAll('[onclick]').forEach(apply);
  }
  enhance(document.body);
  new MutationObserver(muts=>{
    muts.forEach(m=>{
      if(m.type === 'attributes'){ if(m.target.hasAttribute('data-kbd')) reflectState(m.target); return; }
      m.addedNodes.forEach(n=>enhance(n));
    });
  }).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){
      if(e.isComposing) return;
      const lb = document.getElementById('lightbox');
      if(lb && lb.classList.contains('show')){ lb.classList.remove('show'); return; }
      const a = document.activeElement;
      if(a && (a.matches('input, textarea, select, [contenteditable]'))) return; // a half-typed form is not cancelled by a stray Escape
      closeModal(); return;
    }
    if(e.key!=='Enter' && e.key!==' ') return;
    const t = e.target;
    if(!(t && t.getAttribute && t.hasAttribute('data-kbd'))) return;
    e.preventDefault();
    if(e.repeat) return; // holding the key must not fire repeatedly
    const sig = t.getAttribute('onclick');
    t.click();
    // most handlers re-render their container; put focus back on the same control
    setTimeout(()=>{
      if(document.activeElement && document.activeElement !== document.body) return;
      const again = sig && Array.from(document.querySelectorAll('[data-kbd]')).find(x=>x.getAttribute('onclick')===sig);
      if(again) again.focus();
    }, 80);
  });
})();
renderGate();
tryAutoLogin();
