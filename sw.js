// Offline support: keeps the app's files on the device so it opens without internet.
const VERSION = 'planner-v1';
const SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/nav.js', 'js/util.js', 'js/icons.js', 'js/store.js', 'js/sync.js', 'js/components.js', 'js/editor.js',
  'js/views/taskRow.js', 'js/views/tasks.js', 'js/views/notes.js', 'js/views/daily.js', 'js/views/calendar.js',
  'js/views/whiteboard.js', 'js/views/tags.js', 'js/views/settings.js',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== VERSION + '-cdn').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache your data: Supabase requests always go to the network.
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  if (url.origin === self.location.origin) {
    // Serve the saved copy instantly, then refresh it in the background.
    e.respondWith(caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (cached) { e.waitUntil(fresh); return cached; }
      const res = await fresh;
      return res || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }));
    return;
  }

  // Fonts and the Supabase library from CDNs: keep a copy for offline use.
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.hostname)) {
    e.respondWith(caches.open(VERSION + '-cdn').then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }));
  }
});
