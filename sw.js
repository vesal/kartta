const CACHE_NAME = 'map-tiles-v1';

// Intercept fetch requests
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Only cache map tile requests (adjust the condition as needed)
 // Only cache map tile requests (adjust the condition as needed)
  if (url.match(/(tile|tiles|wmts|mapserver)/i)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request.url).then(response => {
          if (response) {
            console.log('Serving from cache:', event.request.url);
            return response;
          }
          return fetch(event.request).then(networkResponse => {
            if (networkResponse.ok || networkResponse.type === "opaque") {
              cache.put(event.request.url, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => response); // fallback to cache if offline
        })
      )
    );
  }
});
