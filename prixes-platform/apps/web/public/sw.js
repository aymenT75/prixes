// Prixes service worker.
// IMPORTANT: navigations + build assets are network-first so a new deploy is
// never shadowed by a stale cached shell (cache-first there breaks the app
// after every rebuild — old HTML points at chunks that no longer exist).
// Bump this on any release you need to force past a stale cache: the byte change
// makes the browser install the new SW, whose activate handler deletes every
// cache that isn't the current name — purging the old shell for all devices.
const CACHE = "prixes-v3";
const SHELL = ["/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never intercept API calls — always live network.
  if (url.pathname.startsWith("/api/")) return;

  // HTML navigations + Next build output: network-first (fall back to cache offline).
  const isNavigation = request.mode === "navigate";
  const isBuildAsset = url.pathname.startsWith("/_next/");
  if (isNavigation || isBuildAsset) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/"))),
    );
    return;
  }

  // Other static assets (icons, fonts, images): stale-while-revalidate.
  e.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
