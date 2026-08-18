/* Meal Plan — offline shell.
   Keeps the app openable in a supermarket with one bar of signal.
   Data still comes from the network; only the app itself is cached. */
const CACHE = "mealplan-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const SHELL_PATHS = new Set(SHELL.map(p => new URL(p, self.registration.scope).pathname));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Anything off-origin (i.e. Supabase) must always go to the network.
  if (url.origin !== location.origin) return;
  // Never cache data traffic, even if the API happens to share our origin.
  if (url.pathname.includes("/rest/v1/") || url.search) return;
  // Only the app shell itself is cacheable.
  if (req.mode !== "navigate" && !SHELL_PATHS.has(url.pathname)) return;

  // The page itself is network-first, so a new version is never a refresh
  // behind. The cache is only there for when there's no signal.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }

  // Stale-while-revalidate: instant load, quietly picks up new versions.
  e.respondWith(
    caches.match(req).then(hit => {
      const live = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || live;
    })
  );
});

