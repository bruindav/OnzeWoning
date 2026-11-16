// sw.js — fix-2
// Zorgt dat de app ook zonder internet opent. Eigen bestanden: eerst netwerk (altijd de nieuwste versie),
// bij geen verbinding uit de cache. Firebase-bibliotheken: uit de cache (veranderen niet per versie).
const CACHE = 'onzewoning-fix-2';
const SCHIL = ['./', './index.html', './app.css', './app.js', './firebase.js', './config.js', './manifest.webmanifest', './icon.svg', './icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SCHIL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('onzewoning-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const kopie = res.clone(); caches.open(CACHE).then((c) => c.put(req, kopie)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
    return;
  }

  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      if (res.ok) { const kopie = res.clone(); caches.open(CACHE).then((c) => c.put(req, kopie)); }
      return res;
    })));
  }
  // Al het andere (Firestore, inloggen, lettertypen) gaat gewoon naar het netwerk.
});
