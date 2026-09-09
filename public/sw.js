// Minimal service worker — exists only to satisfy Chrome's PWA installability
// heuristic (a registered service worker with a fetch handler is required for
// the automatic "Install app" prompt on Android/desktop Chrome; iOS Safari's
// "Add to Home Screen" doesn't need one, see appleWebApp meta in layout.tsx).
//
// Deliberately does NOT cache anything. This app's data (Plex/Tautulli stats,
// session state, file listings, admin content) must never be served stale
// from a cache — a network-only passthrough is the correct behavior here,
// not an oversight to fix later.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Speed test requests must hit the network directly — routing them through
  // this thread first would add local overhead to a tool whose entire job is
  // measuring network performance accurately.
  if (url.pathname.startsWith('/api/speedtest/')) return;
  event.respondWith(fetch(event.request));
});
