// FavoritesHub Service Worker
// Required for PWA installation and the Web Share Target API.

const CACHE = 'fhub-v1';
const PRECACHE = ['/share', '/css/styles.css', '/icons/icon192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Remove old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first: always try the network, fall back to cache.
  // This keeps the app fresh while still working if the server is slow.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
