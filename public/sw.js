const CACHE_NAME = "visiting-card-v2401";
const BASE_PATH = "/Visiting_Card_v2.0.0/";

const PRECACHE_ASSETS = [
    BASE_PATH,
    BASE_PATH + "index.html",
    BASE_PATH + "style.css",
    BASE_PATH + "script.js",
    BASE_PATH + "manifest.json",

    BASE_PATH + "create/",
    BASE_PATH + "create/index.html",
    BASE_PATH + "create/style.css",
    BASE_PATH + "create/script.js",

    BASE_PATH + "card/",
    BASE_PATH + "card/index.html",
    BASE_PATH + "card/style.css",
    BASE_PATH + "card/script.js",

    BASE_PATH + "saved/",
    BASE_PATH + "saved/index.html",
    BASE_PATH + "saved/style.css",
    BASE_PATH + "saved/script.js",

    BASE_PATH + "responses/",
    BASE_PATH + "responses/index.html",
    BASE_PATH + "responses/style.css",
    BASE_PATH + "responses/script.js",

    BASE_PATH + "viewer/",
    BASE_PATH + "viewer/index.html",
    BASE_PATH + "viewer/style.css",
    BASE_PATH + "viewer/script.js",

    BASE_PATH + "success/",
    BASE_PATH + "success/index.html",
    BASE_PATH + "success/style.css",
    BASE_PATH + "success/script.js",

    BASE_PATH + "icons/icon-192.png",
    BASE_PATH + "icons/icon-512.png"
];

/* Install the updated service worker and cache essential files */
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

/* Remove old caches and activate the updated service worker */
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

/* Handle page navigation and static assets */
self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    /* Do not intercept external requests, including Apps Script */
    if (url.origin !== self.location.origin) {
        return;
    }

    /* Use network-first for page navigation */
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response && response.ok) {
                        const copy = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(request, copy));
                    }

                    return response;
                })
                .catch(() =>
                    caches.match(request)
                        .then(cached =>
                            cached || caches.match(BASE_PATH + "index.html")
                        )
                )
        );

        return;
    }

    /* Use cache-first for CSS, JavaScript, images and other assets */
    event.respondWith(
        caches.match(request)
            .then(cached => {
                if (cached) {
                    return cached;
                }

                return fetch(request).then(response => {
                    if (
                        !response ||
                        !response.ok ||
                        response.type === "opaque"
                    ) {
                        return response;
                    }

                    const copy = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(request, copy));

                    return response;
                });
            })
    );
});
