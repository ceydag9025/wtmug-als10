const CACHE = 'p2p-al08-09-v1';
const ASSETS = [
  './', 'index.html', 'web.html', 'mobile.html', 'hoca.html', 'ogrenci.html',
  'style.css', 'common.js', 'web.js', 'mobile.js', 'hoca.js', 'ogrenci.js',
  'sw-register.js', 'manifest.json', 'icons/icon.svg'
];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // CDN'leri cache'leme
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => cached))
  );
});