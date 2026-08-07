// Minimal service worker: enables "installable" PWA status.
// No offline caching of dynamic/auth'd data by design (keeps activity data fresh).
const CACHE = "streakly-shell-v1";
const SHELL = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Network-first, no-op passthrough: intentionally not intercepting requests
  // so authenticated Supabase calls always hit the network.
});
