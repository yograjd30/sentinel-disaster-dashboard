// ──────────────────────────────────────────────────────────────
// SENTINEL — Service Worker for Offline Support
// ──────────────────────────────────────────────────────────────

const CACHE_VERSION = 'sentinel-v1';
const STATIC_CACHE = 'sentinel-static-v1';
const API_CACHE = 'sentinel-api-v1';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/static/css/style.css',
  '/static/js/app.js?v=3',
  '/offline',
  // CDN Libraries
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  // Google Fonts
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
];

// API endpoints to cache responses for
const API_ROUTES = [
  '/api/alerts',
  '/api/resources',
  '/api/weather',
  '/api/incidents',
  '/api/stats',
  '/api/reports',
  '/api/depots',
  '/api/trend-data',
  '/api/demand-supply',
  '/api/missing-persons',
];

// ── Install Event ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      // Use addAll with individual error handling so one failure doesn't block all
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Failed to pre-cache: ${url}`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate Event ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== API_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch Event ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (POST for login, reports, etc. should go to network)
  if (event.request.method !== 'GET') {
    return;
  }

  // ── Strategy 1: API Requests → Network-first, fallback to cache ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone and cache the fresh response
          const responseClone = response.clone();
          caches.open(API_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return empty JSON array as last resort for API
            return new Response(JSON.stringify([]), {
              headers: { 'Content-Type': 'application/json' },
            });
          });
        })
    );
    return;
  }

  // ── Strategy 2: Navigation requests → Network-first, fallback to cache, then offline page ──
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('/offline');
          });
        })
    );
    return;
  }

  // ── Strategy 3: Static assets & CDN → Cache-first, fallback to network ──
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => {
          // Don't cache opaque responses from CDNs that block CORS (they still work)
          // but do cache same-origin and CORS-enabled responses
          if (
            response &&
            response.status === 200
          ) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // For fonts, return nothing gracefully
          if (url.pathname.endsWith('.woff2') || url.pathname.endsWith('.woff')) {
            return new Response('', { status: 200 });
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
    })
  );
});
