// What is off on a page as it stands. The function runs IN the page (hand it to page.evaluate; it uses nothing from
// outside). Shared by tools/shots.js (the screenshot sweep) and phone-layout.e2e.js (the same rules as checks):
//   - wide: elements that reach past the viewport outside any scroll box of their own (the page must never pan sideways);
//     the width is the one the page was opened at — on a phone the browser widens its layout viewport to content that
//     is too wide (the page is then shown zoomed out), so innerWidth alone would hide exactly that,
//   - small (phone, ≤ 600 px): tap targets under 44 × 44 px. A ::before / ::after hit area counts; a checkbox or a radio
//     is measured by its <label> when it has one (a tap on the label is a tap on it); an element that takes no taps
//     (pointer-events: none) is not a target,
//   - covered (phone): a target in full view whose middle or upper part a tap would not reach because something else
//     lies over it — the chrome the page scrolls under excepted (anything fixed: the bars, toasts, sheets; a sticky part
//     while it is stuck at its edge); with a sheet or the photo viewer open only its own targets count.
function audit(arg){
  const phone = arg && typeof arg === 'object' ? !!arg.phone : !!arg, want = arg && typeof arg === 'object' && arg.width ? arg.width : 0;
  const vw = want || innerWidth, out = { vw, innerWidth, scrollWidth: Math.max(document.documentElement.scrollWidth, innerWidth), wide: [], small: [], covered: [] };
  const visible = el => { if(!(el instanceof Element)) return false; const cs = getComputedStyle(el); if(cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (el.offsetParent !== null || cs.position === 'fixed' || cs.position === 'sticky'); };
  const clipped = el => { for(let p = el.parentElement; p && p !== document.body; p = p.parentElement){ const ox = getComputedStyle(p).overflowX; if(ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true; } return false; };
  const label = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ' "' + (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40) + '"';
  document.querySelectorAll('body *').forEach(el => {
    if(!visible(el)) return;
    const r = el.getBoundingClientRect();
    if((r.right > vw + 1 || r.left < -1) && !clipped(el)) out.wide.push(label(el) + ' [' + Math.round(r.left) + '…' + Math.round(r.right) + ']');
  });
  if(phone){
    const hit = el => {
      const r = el.getBoundingClientRect(); let w = r.width, h = r.height;
      ['::before', '::after'].forEach(ps => { const s = getComputedStyle(el, ps); if(s.content === 'none' || s.position !== 'absolute') return;
        const n = x => { const v = parseFloat(x); return isNaN(v) ? 0 : Math.min(0, v); };
        w = Math.max(w, r.width - n(s.left) - n(s.right)); h = Math.max(h, r.height - n(s.top) - n(s.bottom)); });
      return { w: Math.round(w), h: Math.round(h) };
    };
    const labelOf = el => { if(!el.matches('input[type=checkbox], input[type=radio]')) return null; const l = el.closest('label') || (el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null); return l && visible(l) ? l : null; };
    const seen = new Set();
    const scope = document.querySelector('.lightbox.show') || document.querySelector('#modalBack.show #modalContent');
    // the chrome the page scrolls under: anything fixed, and a sticky part while it is stuck at its edge (a sticky part
    // in its place in the flow is page like any other — what it draws there must not lie over a target)
    const fixedChrome = el => { for(let p = el; p && p !== document.documentElement; p = p.parentElement){ const cs = getComputedStyle(p); if(cs.position === 'fixed') return true;
      if(cs.position === 'sticky'){ const r = p.getBoundingClientRect(), t = parseFloat(cs.top), b = parseFloat(cs.bottom); if((!isNaN(t) && Math.abs(r.top - t) < 2) || (!isNaN(b) && Math.abs(innerHeight - r.bottom - b) < 2)) return true; } } return false; };
    document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [onclick], [role="button"], [role="tab"], .chip').forEach(el => {
      if(seen.has(el) || !visible(el)) return; seen.add(el);
      if(getComputedStyle(el).pointerEvents === 'none') return;   // takes no taps (a day of another month, a tag)
      if(el.matches('[onclick]') && /^\s*event\.stopPropagation\(\)\s*;?\s*$/.test(el.getAttribute('onclick'))) return;
      if(el.closest('[onclick]') !== el && el.closest('[onclick]') && !el.matches('button, a, input, select, textarea, summary')) return;   // a child of a tappable row is part of it
      const lab = labelOf(el), s = hit(lab || el);
      if(s.w < 44 || s.h < 44) out.small.push(label(el) + (lab ? ' (its label)' : '') + ' ' + s.w + '×' + s.h);
      // covered: only a target in full view, inside the open sheet / viewer when there is one
      const r = el.getBoundingClientRect();
      if(scope && !scope.contains(el)) return;
      if(r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > vw) return;
      for(const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width / 2, r.top + Math.min(r.height / 4, 10)]]){
        const h = document.elementFromPoint(x, y);
        if(!h || h === el || el.contains(h) || h.contains(el) || (lab && (h === lab || lab.contains(h))) || fixedChrome(h)) continue;
        out.covered.push(label(el) + ' under ' + label(h)); break;
      }
    });
  }
  return out;
}
module.exports = { audit };
