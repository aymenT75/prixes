// ── Prixes Service Worker v2 ──────────────────────────────────────────────
const CACHE_NAME = 'prixes-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap'
];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prixes — Hors ligne</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:sans-serif;background:#f5f4f0;color:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
  .card{background:#fff;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.1);}
  h1{font-size:32px;color:#005c3c;margin-bottom:8px;}
  p{font-size:16px;color:#555;line-height:1.6;margin-bottom:24px;}
  button{background:#00875a;color:#fff;border:none;border-radius:12px;padding:14px 28px;font-size:16px;font-weight:700;cursor:pointer;width:100%;}
</style>
</head>
<body>
  <div class="card">
    <h1>🛒 Prixes</h1>
    <p>Vous êtes hors ligne.<br>Reconnectez-vous pour voir les derniers prix et offres.</p>
    <button onclick="location.reload()">🔄 Réessayer</button>
  </div>
</body>
</html>`;

// ── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache les assets statiques (échec silencieux pour les fonts externes)
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Impossible de mettre en cache :', url, err)
            )
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les extensions Chrome, les blobs, et les requêtes non-GET
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.protocol === 'blob:') return;

  // API carburants : Network first (données fraîches), cache en fallback
  if (url.hostname.includes('data.economie.gouv.fr') ||
      url.hostname.includes('prix-carburants') ||
      url.hostname.includes('roulez-eco')) {
    event.respondWith(
      fetch(request, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined })
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Google Fonts : Cache first (stable)
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
          });
        })
    );
    return;
  }

  // Ressources de l'app : Cache first, network fallback
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;

        return fetch(request)
          .then(response => {
            // Mettre en cache les réponses valides
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => {
            // Hors ligne : page de fallback pour les documents HTML
            if (request.destination === 'document') {
              return new Response(OFFLINE_HTML, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
              });
            }
          });
      })
  );
});

// ── Message ───────────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
