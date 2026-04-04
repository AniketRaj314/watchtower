const CACHE_NAME = 'watchtower-v19';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/config.js',
  '/css/base.css',
  '/css/layout.css',
  '/css/log.css',
  '/css/today.css',
  '/css/insights.css',
  '/css/settings.css',
  '/js/app.js',
  '/js/log.js',
  '/js/today.js',
  '/js/insights.js',
  '/js/settings.js',
  '/manifest.json',
  '/icons/icon-48.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-light.png',
  '/icons/icon-512-light.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return;

  // Network-first for HTML/CSS/JS so updates propagate immediately.
  // Fall back to cache only when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // Strip query string for cache key so ?v=X assets update the base entry
          const url = new URL(e.request.url);
          url.search = '';
          cache.put(url.toString(), clone);
        });
        return res;
      })
      .catch(() => {
        // Offline — try cache with stripped query string
        const url = new URL(e.request.url);
        url.search = '';
        return caches.match(url.toString()).then((cached) => cached || caches.match(e.request));
      })
  );
});
