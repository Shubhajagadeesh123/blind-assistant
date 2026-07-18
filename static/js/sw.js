/**
 * Service Worker for BlindMate PWA
 * Provides offline capabilities and caching
 */

const CACHE_NAME = "blindmate-v2";
const urlsToCache = [
  "/",
  "/static/js/app.js",
  "/static/js/navigation.js",
  "/static/js/memory.js",
  "/static/js/sos.js",
  "/static/css/styles.css",
  "https://cdn.replit.com/agent/bootstrap-agent-dark-theme.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs",
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd",
];

// Install event - cache resources. Uses individual cache.add() calls
// wrapped so one failing resource (e.g. a CDN hiccup) doesn't cause the
// whole installation to fail, unlike cache.addAll() which is all-or-nothing.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return Promise.allSettled(
        urlsToCache.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("Failed to cache (non-fatal):", url, err);
          }),
        ),
      );
    }),
  );
  self.skipWaiting();
});

// Fetch event - serve cached content when offline
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached version or fetch from network
      return response || fetch(event.request);
    }),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});