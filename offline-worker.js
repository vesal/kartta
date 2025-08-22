const CACHE_NAME = "k3-cache-v19";
const DEBUG = false;
const FILES_TO_CACHE = [
  "k3.html",
  "js/leaflet.js",
  "js/leaflet.textpath.js",
  "js/leaflet.css",
  "KeyValStore.js",
  "MapWrapperLeafLet.js",
  "manifest.json",
  "offline-worker.js",
  "icons/cyclo-192.png",
  "icons/cyclo-512.png",
  "icons/map-360.png",
];

let FILE_NAMES = [];

self.addEventListener("install", (event) => {
  FILE_NAMES = FILES_TO_CACHE.map(f => f.split("/").pop());
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE).then(() => {
        return self.skipWaiting();
      });
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const fileName = url.pathname.split("/").pop();

  if (FILE_NAMES.includes(fileName)) {
    const cacheUrl = new URL(event.request.url);
    cacheUrl.search = "";
    const cacheRequest = new Request(cacheUrl, {
      method: event.request.method,
      headers: event.request.headers,
      credentials: event.request.credentials,
      redirect: event.request.redirect,
      referrer: event.request.referrer,
      referrerPolicy: event.request.referrerPolicy,
      integrity: event.request.integrity,
      cache: event.request.cache,
    });
    event.respondWith(
      caches.match(cacheRequest).then((response) => {
        if (response) {
          if (DEBUG) console.log("Haettu cachesta:", event.request.url);
          return response;
        }
        if (DEBUG) console.log("Haetaan verkosta:", event.request.url);
        return fetch(event.request);
      })
    );
    return;
  }
  if (DEBUG) console.log("Haetaan cachen ohi:", event.request.url);
});
