// Minimal, conservative service worker for Parakkan Petroleum.
//
// Its only jobs:
//   1. Exist with a `fetch` handler so Chrome treats the site as installable
//      (that's what triggers the "Add to Home Screen" / "Install app" prompt).
//   2. Cache immutable static assets (the Next build output, fonts, icons) so
//      the app opens fast and survives a flaky connection at the pump.
//
// It deliberately NEVER caches:
//   - anything under /api/ (auth + live money data must always hit the server)
//   - POST/PATCH/etc. (form submissions must never be served from cache)
//   - page HTML (could leak one staffer's screen to the next on a shared phone)

const CACHE = "parakkan-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|css|js)$/.test(url.pathname);

  if (!isStatic) return; // let everything else (pages) go straight to the network

  // Cache-first for immutable assets, with a background fill.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
    )
  );
});
