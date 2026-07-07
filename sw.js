// FallWatch service worker · offline-first shell
const CACHE = 'fallwatch-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache companion or estate probes
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return;
  if (url.hostname.endsWith('.github.io') && url.pathname !== '/fallwatch/' && !url.pathname.startsWith('/fallwatch/')) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(()=>{});
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
