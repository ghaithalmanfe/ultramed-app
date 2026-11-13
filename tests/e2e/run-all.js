// Runs every browser harness in turn (each owns a distinct port) and fails on
// the first red one. `npm run e2e` — or one file: `node tests/e2e/smoke-all.e2e.js`.
const { spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.e2e.js')).sort();
let failed = 0;
const run = f => { const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'pipe', encoding: 'utf8', env: process.env, timeout: 15 * 60 * 1000 });
  const out = (r.stdout || '') + (r.stderr || ''); return { ok: r.status === 0 && /ALL CHECKS PASSED/.test(out), out }; };
const reds = out => out.split('\n').filter(l => /^❌|HARNESS ERROR|Error|CHECK\(S\) FAILED/.test(l)).slice(0, 30).join('\n');
// The deploy waits for these (v123, pages.yml). A harness that fails is run
// once more, alone: a timing-sensitive one on a busy runner (photo-lifecycle
// failed v122's run once after passing on identical code) passes the second
// time; a real failure fails twice. Both runs are in the log.
for(const f of files){
  const t0 = Date.now();
  let r = run(f), retried = false;
  if(!r.ok){ console.log(`↻ ${f} failed — running it once more\n` + reds(r.out)); r = run(f); retried = true; }
  console.log(`${r.ok ? '✅' : '❌'} ${f}  (${Math.round((Date.now() - t0) / 1000)}s)${r.ok && retried ? ' — passed on its second run' : ''}`);
  if(!r.ok){ failed++; console.log(reds(r.out)); }
}
console.log(failed ? `\n${failed} harness file(s) failed` : '\nALL E2E HARNESSES PASSED');
process.exit(failed ? 1 : 0);
