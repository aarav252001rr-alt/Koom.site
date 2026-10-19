/* KOOM service worker: instant loads + offline app shell. Music/API traffic is never cached here. */
const V = 'koom-shell-v18', IMG = 'koom-img-v1';
const SHELL = ['./', 'index.html', 'app.js?v=5', 'i18n.js?v=5', 'config.js', 'koom.js?v=13', 'style.css?v=11', 'glass.css?v=3', 'glass.js?v=2', 'offline.js?v=2', 'features.js?v=1', 'manifest.webmanifest', 'icon-192.png', 'favicon-32.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === location.origin) {                         // app shell: stale-while-revalidate
    e.respondWith(caches.open(V).then(async c => {
      const hit = await c.match(r, { ignoreSearch: false }) || await c.match(r, { ignoreSearch: true });
      const net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  } else if (r.destination === 'image') {                     // cover art: cache-first, capped
    e.respondWith(caches.open(IMG).then(async c => {
      const hit = await c.match(r); if (hit) return hit;
      try { const res = await fetch(r); if (res.ok || res.type === 'opaque') { c.put(r, res.clone()); c.keys().then(k => { if (k.length > 300) c.delete(k[0]); }); } return res; } catch (err) { return hit || Response.error(); }
    }));
  }
});
