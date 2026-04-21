const CACHE = 'georgian-v17';

const BASE = self.location.pathname.replace(/\/sw\.js$/, '');

// Only truly static third-party assets are pre-cached
const PRECACHE = [
  'https://cdn.jsdelivr.net/npm/dexie@3/dist/dexie.min.js',
];

// These are always fetched from the network first.
// On failure (offline) the cached copy is used instead.
// This prevents a broken server response from ever being served permanently.
const NETWORK_FIRST = [
  '/index.html', '/', '/sw.js',
  '/js/', '/css/',
  '/data/verbs.json', '/data/tatoeba.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  const isNetworkFirst = NETWORK_FIRST.some(p => url.pathname.includes(p));

  if (isNetworkFirst) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first for everything else (CDN assets, icons, etc.)
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
  }
});
