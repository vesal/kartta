const CACHE_NAME = "k3-cache-v0.4.21";
const DEBUG = false;
const FILES_TO_CACHE = [
  "k3.html",
  "js/winbox.bundle.min.js",
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
  "icons/map-800.png",
];

// let FILE_NAMES = [];
const FILE_NAMES = FILES_TO_CACHE.map(f => f.split("/").pop());

function log(msg, ...args) {
  if (!DEBUG) return;

  // Tulostetaan Worker-konsoliin
  console.log("[W]", msg, ...args);

  // Lähetetään viesti myös kaikille asiakkaille (avoimet sivut)
  self.clients.matchAll().then((clients) => {
    clients.forEach(client => {
      client.postMessage({
        type: "log",
        message: `[SW] ${msg} ${args.length ? JSON.stringify(args) : ""}`
      });
    });
  });
}

self.addEventListener("install", (event) => {
  // FILE_NAMES = FILES_TO_CACHE.map(f => f.split("/").pop());
  log("Asennetaan:", CACHE_NAME, FILES_TO_CACHE, FILE_NAMES);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE).then(() => {
        return self.skipWaiting();
      });
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Poista vanhat cachet
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        if (cacheName !== CACHE_NAME) {
          log("Deleting old cache:", cacheName);
          await caches.delete(cacheName);
        }
      }
      // Ota hallinta heti käyttöön
      await self.clients.claim();
      log("Now controlling all clients.");
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const fileName = url.pathname.split("/").pop();
  log("fetch alkaa:", fileName);

  if (FILE_NAMES.includes(fileName)) {
    const cacheUrl = new URL(event.request.url);
    cacheUrl.search = ""; // Poistetaan mahdolliset query-parametrit, jotta saadaan tarkka match
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
          log("Haettu cachesta:", event.request.url);
          return response;
        }
        log("Haetaan verkosta:", event.request.url);
        return fetch(event.request);
      })
    );
    return;
  }
  log("Haetaan cachen ohi:", event.request.url);
});
