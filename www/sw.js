const CACHE = 'ultramed-field-ops-v63';
const SHELL = ['./', './index.html', './js/core.js', './manifest.json', './icons/icon-192.png', './icons/logo-green.png', './icons/icon-512.png'];
// The Firebase SDK lives on gstatic; without it a cached session cannot boot
// offline at all, so precache it too (no-cors -> opaque, cached all the same).
const EXTERNAL = [
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    c.addAll(SHELL),
    // best-effort: a gstatic hiccup must not fail the whole install
    ...EXTERNAL.map(u => fetch(u, {mode:'no-cors'}).then(r => c.put(u, r)).catch(()=>{})),
  ])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Same-origin app files, plus the Firebase SDK scripts — without the SDK a
  // cached session cannot start offline at all.
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (url.origin !== self.location.origin && !firebaseSdk) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        // Cross-origin <script> fetches (the Firebase SDK) come back OPAQUE
        // with ok:false — they must still be cached or offline boot dies.
        if (res && (res.ok || res.type === 'opaque')) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
