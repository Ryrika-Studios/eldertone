// Eldertone offline support (installed home-screen app).
// The game page is fetched from the network first so every publish reaches players
// the next time they are online; if the network is down (or slower than NET_TIMEOUT)
// the copy cached on the device is served instead. Icons and the Google Fonts are
// cached on first use.
const CACHE = "eldertone-v1";
const NET_TIMEOUT = 4000;
const CORE = ["./", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function isPage(req) {
  return req.mode === "navigate" || /\/(index\.html)?$/.test(new URL(req.url).pathname);
}

// network first: refresh the cached game whenever the network answers; fall back to it otherwise
function pageFirst(req) {
  return caches.open(CACHE).then((cache) => {
    const net = fetch(req).then((res) => {
      if (res && res.ok)
        cache.put("./", res.clone());
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, NET_TIMEOUT));
    return Promise.race([net.catch(() => null), timeout]).then((res) => (res && res.ok) ? res
      : cache.match("./").then((hit) => hit || net));
  });
}

// cache first for everything else (icons, manifest, fonts), storing what the network returns
function cacheFirst(req) {
  return caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && (res.ok || res.type === "opaque")) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  }));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET")
    return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && isPage(req))
    e.respondWith(pageFirst(req));
  else if (sameOrigin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname))
    e.respondWith(cacheFirst(req));
});
