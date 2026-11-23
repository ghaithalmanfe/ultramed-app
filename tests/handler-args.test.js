'use strict';
// No stored value inside an inline handler's code (v129, the security audit's C1). Until v128 about 190 handlers
// wrote an id, a name, a date or a key straight into their JavaScript — onclick="openClinicDetail('${c.id}')" — and
// 39 more through esc(), which is HTML encoding: the parser turns &#39; back into ' before the handler is compiled.
// A team member who stored a crafted id ran script in the supervisor's session. Every ${…} inside a quoted string of
// an on*="…" attribute must now be ${jsArg(…)}; a ${…} outside a string must be code or a number the app writes
// itself (BARE_OK below — add to it only after reading what the value can hold).
// This scan reads www/js/app/*.js (WWW=<path> for another checkout).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WWW = path.resolve(process.env.WWW || path.join(__dirname, '..', 'www'));
const APP = path.join(WWW, 'js', 'app');
const core = require(path.join(WWW, 'js', 'core.js'));
// Bare ${…} in a handler: code strings the app writes itself (moreTile, the home cards and rows, the chips' setter,
// the sales-check retry and cancel, the ERP links' pick) and numbers from its own arrays (indexes, day offsets,
// discount presets, the months of Month by month).
const BARE_OK = new Set(['action', 'setter', 'retry', 'cancel', 'o.d', 'd', 'idx', 'i', 'bi', 'binIdx', 'k',
  'editing?idx:-1', 'staff.indexOf(person)', 'staff.indexOf(s)',
  "pick ? 'openErpLinkPreviewFor(this.dataset.erpLink, this.dataset.to)' : \"openErpLinkEdit(this.dataset.erpLink, 'links')\"",
  "reopenId?`,'${jsArg(reopenId)}'`:''"]);

function readExpr(s, i){
  let depth = 1, j = i, q = null;
  while(j < s.length){
    const ch = s[j];
    if(q){ if(ch === '\\'){ j += 2; continue; } if(ch === q) q = null; else if(q === '`' && ch === '$' && s[j + 1] === '{'){ j = readExpr(s, j + 2)[1]; continue; } j++; continue; }
    if(ch === "'" || ch === '"' || ch === '`'){ q = ch; j++; continue; }
    if(ch === '/' && /[(,=:[!&|?{};]\s*$/.test(s.slice(Math.max(i, j - 3), j) || '(')){
      let k = j + 1, cls = false;
      while(k < s.length){ const c = s[k]; if(c === '\\'){ k += 2; continue; } if(c === '[') cls = true; else if(c === ']') cls = false; else if((c === '/' && !cls) || c === '\n') break; k++; }
      j = k + 1; continue;
    }
    if(ch === '{') depth++;
    else if(ch === '}'){ depth--; if(!depth) return [s.slice(i, j), j + 1]; }
    j++;
  }
  throw new Error('unbalanced ${ at ' + i);
}
// every ${…} of every on*="…" attribute: { file, line, expr, inString }
function handlerValues(){
  const out = [];
  for(const f of fs.readdirSync(APP).filter(f => f.endsWith('.js')).sort()){
    const s = fs.readFileSync(path.join(APP, f), 'utf8');
    const re = /\bon[a-z]+="/g; let m;
    while((m = re.exec(s))){
      let j = m.index + m[0].length, inStr = false;
      while(j < s.length && s[j] !== '"'){
        if(s[j] === '\\' && s[j + 1] === "'"){ inStr = !inStr; j += 2; continue; }
        if(s[j] === "'"){ inStr = !inStr; j++; continue; }
        if(s[j] === '$' && s[j + 1] === '{'){
          const r = readExpr(s, j + 2);
          out.push({ file: f, line: s.slice(0, j).split('\n').length, expr: r[0].trim(), inString: inStr });
          j = r[1]; continue;
        }
        j++;
      }
      re.lastIndex = j + 1;
    }
  }
  return out;
}

test('every stored value inside an inline handler\'s JavaScript string goes through jsArg()', () => {
  const vals = handlerValues();
  assert.ok(vals.length > 200, 'the scan finds the handlers (' + vals.length + ')');
  const bad = vals.filter(v => v.inString && !/^jsArg\(/.test(v.expr)).map(v => `${v.file}:${v.line} '${v.expr}'`);
  assert.deepEqual(bad, [], 'wrap these in jsArg(): ' + bad.join(' | '));
});

test('a ${…} outside a handler\'s strings is code or a number the app writes itself', () => {
  const bad = handlerValues().filter(v => !v.inString && !BARE_OK.has(v.expr)).map(v => `${v.file}:${v.line} ${v.expr}`);
  assert.deepEqual(bad, [], 'not on the reviewed list (BARE_OK): ' + bad.join(' | '));
});

test('jsArg: a handler reads back exactly the value, whatever it holds', () => {
  const tricky = ["c1", "it's", 'say "hi"', 'back\\slash\\', "c9\" data-x=\"1\"><img src=x onerror=alert(1)>", "Renova'+alert(1)+'",
    'Renova&#39;+alert(1)+&#39;', '</script><script>alert(1)</script>', 'line\nbreak\r\n', 'sep\u2028\u2029', '`${alert(1)}`', '', 5, null, undefined, 'عيادة النور'];
  for(const v of tricky){
    const code = core.jsArg(v);
    assert.ok(!/[&<>"'\\\r\n\u2028\u2029`]/.test(code.replace(/\\u[0-9a-f]{4}/g, '')), 'only safe characters left: ' + JSON.stringify(code));
    // the attribute as the HTML parser leaves it (no entity can appear) → the handler's JavaScript
    let got; new Function('f', "f('" + code + "')")(x => { got = x; });
    assert.equal(got, String(v), JSON.stringify(v));
  }
});

test('esc() writes a number as its digits; empty values stay empty', () => {
  assert.equal(core.esc(5), '5');
  assert.equal(core.esc(12.5), '12.5');
  assert.equal(core.esc(0), '');
  assert.equal(core.esc(null), '');
  assert.equal(core.esc(undefined), '');
  assert.equal(core.esc('<b a="x">'), '&lt;b a=&quot;x&quot;&gt;');
});

test('safeImg, clsKey and numAttr let only their own kind through', () => {
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  assert.equal(core.safeImg(jpeg), jpeg);
  assert.equal(core.safeImg('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(core.safeImg('x" onerror="alert(1)'), '');
  assert.equal(core.safeImg('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(core.safeImg('https://example.com/a.jpg'), '');
  assert.equal(core.safeImg(null), '');
  ['A', 'B', 'C', 'D', 'F', 'Closed'].forEach(k => assert.equal(core.clsKey(k), k));
  assert.equal(core.clsKey('<img src=x onerror=alert(1)>'), 'none');
  assert.equal(core.clsKey(undefined), 'none');
  assert.equal(core.numAttr(12.5), '12.5');
  assert.equal(core.numAttr('3'), '3');
  assert.equal(core.numAttr('"><img src=x>'), '');
  assert.equal(core.numAttr(null), '');
  assert.equal(core.numAttr(''), '');
  assert.equal(core.numAttr(0), '0');
});
