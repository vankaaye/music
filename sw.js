/* Music PWA service worker.
   - Precaches the app shell so the app opens with no connection.
   - Locally imported audio lives in IndexedDB, so it is never cached here.
   - For a connected WebDAV/TrueNAS server, attaches Basic auth to media
     requests so <audio> can stream (and seek via Range) from the server. */
const CACHE = 'music-shell-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

let serverCfg = null; // { base, user, pass } — pushed from the page

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'server-cfg') serverCfg = data.cfg || null;
});

function basicAuth(cfg) {
  if (!cfg || !cfg.user) return null;
  // btoa needs latin1; encode UTF-8 credentials safely.
  const raw = cfg.user + ':' + (cfg.pass || '');
  const utf8 = unescape(encodeURIComponent(raw));
  return 'Basic ' + btoa(utf8);
}

function isServerRequest(url) {
  if (!serverCfg || !serverCfg.base) return false;
  try {
    return new URL(url).origin === new URL(serverCfg.base).origin;
  } catch (e) {
    return false;
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Media streaming from the configured server: re-issue with auth so the
  // <audio> element can play and seek. Never cached (files can be large).
  if (url.origin !== self.location.origin) {
    if (isServerRequest(req.url)) {
      const auth = basicAuth(serverCfg);
      if (auth) {
        const headers = new Headers(req.headers);
        headers.set('Authorization', auth);
        event.respondWith(fetch(new Request(req.url, {
          method: 'GET',
          headers,
          mode: 'cors',
          credentials: 'omit',
          redirect: 'follow'
        })));
      }
    }
    return; // other cross-origin requests pass through untouched
  }

  const isHTML = req.mode === 'navigate' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('/index.html');

  if (isHTML) {
    // Network-first: an installed app must never be stuck on an old build.
    // Falls back to the cached shell when offline.
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(c => c || caches.match('./')))
    );
    return;
  }

  // Other shell assets: serve fast from cache, refresh in the background.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
