// Builds the site that GitHub Pages publishes: www/ → dist/.
// The app script is edited as small files (www/js/app/NN-area.js, loaded by
// <script src> tags in the source index.html). For the phones it is inlined
// back into ONE <script> block, so the published index.html is a single
// self-contained file exactly as before the split: an interrupted update can
// never leave a phone with a page whose code is missing.
// Usage: node scripts/build.js [srcDir=www] [outDir=dist]
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'www'));
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'dist'));
const HEADER = /^\/\/ [^\n]*\n\/\/ \(part of the UltraMed app script — the files under js\/app load in order and share one global scope\)\n/;
const TAG = /^<script src="js\/app\/(\d{2}-[a-z0-9-]+)\.js"><\/script>$/;

function fail(msg){ console.error('build failed: ' + msg); process.exit(1); }
function copyDir(from, to, skip){
  fs.mkdirSync(to, { recursive: true });
  for(const e of fs.readdirSync(from, { withFileTypes: true })){
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if(skip(a)) continue;
    if(e.isDirectory()) copyDir(a, b, skip); else fs.copyFileSync(a, b);
  }
}
function build(){
  const appDir = path.join(SRC, 'js', 'app');
  const lines = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8').split('\n');
  const at = lines.map((l, i) => TAG.test(l) ? i : -1).filter(i => i >= 0);
  if(!at.length) fail('no <script src="js/app/…"> tags in index.html');
  if(at[at.length - 1] - at[0] !== at.length - 1) fail('the js/app script tags must sit together in one block');
  const listed = at.map(i => lines[i].match(TAG)[1]);
  const onDisk = fs.readdirSync(appDir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
  if(JSON.stringify(listed) !== JSON.stringify([...listed].sort())) fail('js/app script tags are not in file order: ' + listed.join(', '));
  if(JSON.stringify(listed) !== JSON.stringify(onDisk)) fail('index.html loads [' + listed.join(', ') + '] but js/app holds [' + onDisk.join(', ') + ']');
  let body = '';
  for(const name of listed){
    let t = fs.readFileSync(path.join(appDir, name + '.js'), 'utf8');
    if(!HEADER.test(t)) fail(name + '.js lost its two-line header comment');
    t = t.replace(HEADER, '');
    if(/<\/script/i.test(t)) fail(name + '.js contains "</script" — it would end the inline block early');
    if(!t.endsWith('\n')) t += '\n';
    body += t;
  }
  const html = lines.slice(0, at[0]).join('\n') + '\n<script>\n' + body + '</script>\n' + lines.slice(at[at.length - 1] + 1).join('\n');
  // the service worker must not precache files the published site does not ship
  const sw = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
  if(/js\/app\//.test(sw)) fail('sw.js lists js/app files — the published site inlines them, so the install would fail');
  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(SRC, OUT, p => p === appDir);
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  return { files: listed.length, bytes: html.length };
}
if(require.main === module){ const r = build(); console.log(`built ${path.relative(ROOT, OUT) || OUT}: ${r.files} app files inlined, index.html ${Math.round(r.bytes / 1024)} KB`); }
module.exports = { build };
