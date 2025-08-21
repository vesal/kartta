const CACHE_NAME = "k3-cache-v7";
const FILES_TO_CACHE = [
  "./k3.html",
  "./js/leaflet.js",
  "./js/leaflet.textpath.js",
  "./js/leaflet.css",
  "./KeyValStore.js",
  "./MapWrapperLeafLet.js",
  "./manifest.json",
  "./offline-worker.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (FILES_TO_CACHE.includes(url.pathname) || FILES_TO_CACHE.includes(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          // console.log("Haettu cachesta:", event.request.url);
          return response;
        }
        // console.log("Haetaan verkosta:", event.request.url);
        return fetch(event.request);
      })
    );
  }
});
