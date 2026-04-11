const CACHE = 'georgian-v13';

// Works both at root (localhost) and a subpath (GitHub Pages)
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');

const STATIC_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/data/verbs.json',
  'https://cdn.jsdelivr.net/npm/dexie@3/dist/dexie.min.js',
];

// JS and CSS: network-first (always get fresh code, fall back to cache offline)
const CODE_ASSETS = [
  BASE + '/css/style.css',
  BASE + '/js/srs.js',
  BASE + '/js/db.js',
  BASE + '/js/study.js',
  BASE + '/js/ui.js',
  BASE + '/js/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled([...STATIC_ASSETS, ...CODE_ASSETS].map(a => c.add(a))))
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
  const url = e.request.url;

  // Network-first for JS and CSS
  const isCode = CODE_ASSETS.some(a => url.endsWith(a) || url.includes('/js/') || url.includes('/css/'));
  if (isCode) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
