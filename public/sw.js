// Minimal service worker: enables "installable" PWA status.
// No offline caching of dynamic/auth'd data by design (keeps activity data fresh).
const CACHE = "streakly-shell-v2";
const SHELL = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
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
  // Only handle top-level page navigations (someone opening/reloading a
  // route) — everything else (Supabase API calls, static assets, etc.)
  // still passes straight through untouched, same as before, so
  // authenticated/dynamic data is never served stale from cache.
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match("/offline.html"))
  );
});
