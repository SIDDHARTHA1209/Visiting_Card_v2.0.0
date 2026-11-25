/*
  DigiCard service worker (v3000)

  - Pages, scripts and styles: NETWORK-FIRST (with a short timeout), falling
    back to the cache. A new deploy is therefore picked up immediately and the
    HTML / JS / CSS can never get out of sync (the old cache-first strategy could
    serve an old page with new scripts or the other way round).
  - Images, icons and the QR library CDN file: CACHE-FIRST (they never change).
  - API calls (Apps Script) are never intercepted.
*/
const CACHE_NAME = "digicard-v5000";
const BASE_PATH = new URL(self.registration.scope).pathname;
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE_ASSETS = [
    "",
    "index.html",
    "style.css",
    "script.js",
    "common.js",
    "picker.js",
    "install.js",
    "manifest.json",
    "create/",
    "create/style.css",
    "create/script.js",
    "card/",
    "card/style.css",
    "card/script.js",
    "saved/",
    "saved/style.css",
    "saved/script.js",
    "success/",
    "success/style.css",
    "success/script.js",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon.svg",
    "icons/apple-touch-icon.png"
].map(path => BASE_PATH + path);

const CACHEABLE_CDN_HOSTS = [
    "cdnjs.cloudflare.com",
    "cdn.jsdelivr.net",
    "flagcdn.com"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache =>
                /* one missing file must not break the whole install */
                Promise.all(
                    PRECACHE_ASSETS.map(url =>
                        cache.add(url).catch(() => null)
                    )
                )
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys =>
                Promise.all(
                    keys
                        .filter(key => key !== CACHE_NAME)
                        .map(key => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

function putInCache(request, response) {
    if (response && response.ok && response.type !== "opaque") {
        const copy = response.clone();

        caches.open(CACHE_NAME)
            .then(cache => cache.put(request, copy))
            .catch(() => null);
    }

    return response;
}

function networkFirst(request) {
    return new Promise(resolve => {
        let settled = false;

        const fallback = () =>
            caches.match(request, { ignoreSearch: true })
                .then(cached => cached || null);

        const timer = setTimeout(() => {
            /* slow network: show the cached copy if there is one, but let the
               network request keep going so the cache is refreshed */
            fallback().then(cached => {
                if (cached && !settled) {
                    settled = true;
                    resolve(cached);
                }
            });
        }, NETWORK_TIMEOUT_MS);

        fetch(request, { cache: "no-cache" })
            .then(response => {
                clearTimeout(timer);
                putInCache(request, response);

                if (!settled) {
                    settled = true;
                    resolve(response);
                }
            })
            .catch(() => {
                clearTimeout(timer);

                if (settled) return;

                fallback().then(cached => {
                    settled = true;
                    resolve(
                        cached ||
                        (request.mode === "navigate"
                            ? caches.match(BASE_PATH + "index.html")
                            : Response.error())
                    );
                });
            });
    });
}

function cacheFirst(request) {
    return caches.match(request).then(cached => {
        if (cached) return cached;

        return fetch(request).then(response => putInCache(request, response));
    });
}

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    if (url.origin !== self.location.origin) {
        if (CACHEABLE_CDN_HOSTS.includes(url.hostname)) {
            event.respondWith(cacheFirst(request));
        }

        /* everything else (Apps Script API, Drive images) goes straight to the network */
        return;
    }

    const isImage =
        /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(url.pathname);

    if (isImage) {
        event.respondWith(cacheFirst(request));
        return;
    }

    event.respondWith(networkFirst(request));
});
