'use strict';
// "Saved" only when the save landed (v123, audit item 4). Until v122 about 37
// save actions awaited persist(…) and then showed their success toast whatever
// the save did: "🎯 Monthly targets saved" while the cloud refused, and the
// next refresh put the old figures back. Every save action now reads its own
// outcome (persistTold / persistFor) and tells it with saveToast.
// This scan reads www/js/app/*.js (WWW=<path> for another checkout) and fails
// on a save whose result is thrown away — `await persist('x');` as a
// statement, `persist('x');` fire-and-forget, `await Promise.all([persist(…)…])`
// unassigned — followed in the same function by a toast that is not a
// failure notice.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WWW = path.resolve(process.env.WWW || path.join(__dirname, '..', 'www'));
const APP = path.join(WWW, 'js', 'app');
const SAVE = '(?:persist|persistFor|persistTold|persistTeam|persistTombs)';
// a save in statement position: its value goes nowhere
const DISCARDED = new RegExp('(?:^|[;{}]|\\)|\\belse)\\s*(?:await\\s+)?(?:Promise\\.all\\(\\s*\\[[^\\]]*\\b' + SAVE + '\\(|' + SAVE + '\\()');
// the first argument of a call, up to its closing parenthesis or first top-level comma
function firstArg(code, from){
  let depth = 0, q = null, i = from;
  for(; i < code.length; i++){
    const ch = code[i];
    if(q){ if(ch === '\\') i++; else if(ch === q) q = null; continue; }
    if(ch === "'" || ch === '"' || ch === '`'){ q = ch; continue; }
    if('([{'.includes(ch)) depth++;
    else if(')]}'.includes(ch)){ if(depth === 0) break; depth--; }
    else if(ch === ',' && depth === 0) break;
  }
  return code.slice(from, i).trim();
}
// A toast that only ever says a save did NOT land (or why): every string in it
// opens with a warning sign, or it is the refusal notice itself.
const WARN = /^(?:⚠️|🛑|❌|📴|🔒|⏳)/u;
function failureOnly(arg){
  if(/^NOT_ALLOWED_MSG$/.test(arg)) return true;
  const strs = arg.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
  return strs.length > 0 && strs.every(s => WARN.test(s.slice(1)));
}
// Top-level functions (column 0) and their lines, the way the app's files are written.
function functionsOf(text){
  const lines = text.split('\n'), out = [];
  let cur = null;
  lines.forEach((l, i) => {
    const m = l.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/);
    if(m || /^(?:const|let|var)\s/.test(l)){ cur = m ? { name: m[1], start: i + 1, lines: [] } : null; if(cur) out.push(cur); }
    if(cur) cur.lines.push(l.replace(/(^|\s)\/\/ .*$/, '$1'));
  });
  return out;
}
function scan(text, file){
  const found = [];
  functionsOf(text).forEach(fn => {
    let saveAt = null;
    fn.lines.forEach((line, k) => {
      if(/^\s*(?:async\s+)?function\s/.test(line) && k === 0){ /* the declaration line itself may also hold code */ }
      const m = DISCARDED.exec(line);
      let from = 0;
      if(m && saveAt == null){ saveAt = fn.start + k; from = m.index + m[0].length; }
      if(saveAt == null) return;
      const re = /\bshowToast\(/g; re.lastIndex = from;
      let t;
      while((t = re.exec(line))){
        const arg = firstArg(line, t.index + t[0].length);
        if(!failureOnly(arg)) found.push(`${file}:${fn.start + k} ${fn.name}() — save at line ${saveAt} is not checked before showToast(${arg.slice(0, 70)})`);
      }
    });
  });
  return found;
}

test('the scan itself: a save thrown away before a success toast is caught; a checked one, or a failure notice, is not', () => {
  const bad = [
    "async function saveTargets(){\n  await persist('targets');\n  showToast('🎯 Monthly targets saved');\n}\n",
    "async function a(){ if(x) await persist('clinics'); showToast(`✅ ${n} saved`); }\n",
    "async function b(){\n  await Promise.all([persist('visits'), persist('clinics')]);\n  closeModal();\n  showToast(ok ? 'Moved to recycle bin' : 'x');\n}\n",
    "async function c(){\n  persist('products');\n  showToast(msg);\n}\n",
  ];
  bad.forEach(src => assert.equal(scan(src, 'x.js').length, 1, src));
  const good = [
    "async function saveTargets(){\n  const r = await persistTold('targets');\n  saveToast(r, 'targets', '🎯 Monthly targets saved');\n}\n",
    "async function d(){\n  if(!await persist('events')){ showToast('❌ Not saved'); return; }\n  showToast('✅ Saved');\n}\n",
    "async function e(){\n  await persist('tasks');\n  renderToday();\n}\n",
    "async function f(){\n  await persist('recycleBin');\n  showToast('⚠️ لم يصل — أعد المحاولة');\n}\n",
    "async function g(){\n  const saves = [persistTold('products')];\n  saves.push(persist('visits'));\n  const [r] = await Promise.all(saves);\n  saveToast(r, 'products', 'ok');\n}\n",
  ];
  good.forEach(src => assert.deepEqual(scan(src, 'x.js'), [], src));
});

test('every save action in www/js/app reads its own outcome before it says "saved"', () => {
  const files = fs.readdirSync(APP).filter(f => f.endsWith('.js')).sort();
  assert.ok(files.length >= 10, 'the app files were not found under ' + APP);
  const found = [];
  files.forEach(f => found.push(...scan(fs.readFileSync(path.join(APP, f), 'utf8'), f)));
  assert.deepEqual(found, [], 'a save whose result is not used before a success message:\n' + found.join('\n'));
});

test('the outcome helpers exist where the app files share them', () => {
  const sync = fs.readFileSync(path.join(APP, '04-sync.js'), 'utf8');
  for(const fn of ['persistTold', 'saveToast', 'saveToastAll', 'saveFailText', 'saveBlocked', 'saveErrKind'])
    assert.match(sync, new RegExp('^function ' + fn + '\\(', 'm'), fn + ' is defined in 04-sync.js');
});
