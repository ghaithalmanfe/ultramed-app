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
  document.getElementById('modalBack').classList.add('show');
}
function closeModal(){ document.getElementById('modalBack').classList.remove('show'); }
function closeModalBg(e){ if(e.target.id==='modalBack') closeModal(); }

if('serviceWorker' in navigator){
  // Registering on window 'load' misses the event entirely on this page: the
  // blocking Firebase SDK <script> tags in <head> can delay this inline
  // script past the point 'load' already fired, so the listener never runs.
  const registerSW = () => navigator.serviceWorker.register('sw.js').catch(e=>console.error('SW register failed', e));
  if(document.readyState === 'complete') registerSW();
  else window.addEventListener('load', registerSW);
}
if(FIREBASE_ENABLED){
  // Poll for changes made by other reps/devices so data stays reasonably fresh
  // without a full realtime-listener rewrite of every render call.
  setInterval(async ()=>{
    // Never swap the in-memory sales data underneath an upload or a save in
    // flight, or over edits the cloud has not confirmed yet.
    if(typeof _erpImporting !== 'undefined' && (_erpImporting || _erpSaving || _erpDirty)) return;
    if(currentUser && document.visibilityState==='visible'){
      // Queued offline edits must reach the cloud BEFORE a refresh replaces
      // memory with the (still-stale) cloud copy — otherwise they'd be lost.
      // If a flush keeps failing we still refresh periodically so the device
      // never gets pinned to stale data forever (merge-on-save protects the
      // queued entries, and the mirror still wins for the stuck key).
      if(outboxList().length){
        await flushOutbox();
        _stuckTicks = outboxList().length ? _stuckTicks + 1 : 0;
        if(_stuckTicks < 15) return;   // ~5 minutes of retries before refreshing anyway
        _stuckTicks = 0;
      }
      await loadAll();
      if(document.getElementById('view-team').classList.contains('active')){ if(teamTab==='mem') renderMemories(); else renderChat(); }
    }
  }, 20000);
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
}
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
