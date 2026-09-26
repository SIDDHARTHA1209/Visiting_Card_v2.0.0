const CACHE_NAME="visiting-card-v1";
const BASE_PATH="/Visiting_Card_v2.0.0/";

const PRECACHE_ASSETS=[
  BASE_PATH,
  BASE_PATH+"index.html",
  BASE_PATH+"style.css",
  BASE_PATH+"script.js",
  BASE_PATH+"manifest.json",
  BASE_PATH+"card/",
  BASE_PATH+"card/index.html",
  BASE_PATH+"card/style.css",
  BASE_PATH+"card/script.js",
  BASE_PATH+"success/",
  BASE_PATH+"success/index.html",
  BASE_PATH+"success/style.css",
  BASE_PATH+"success/script.js",
  BASE_PATH+"icons/icon-192.png",
  BASE_PATH+"icons/icon-512.png"
];

self.addEventListener("install",event=>{
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(PRECACHE_ASSETS))
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(cacheNames=>{
        return Promise.all(
          cacheNames
            .filter(cacheName=>cacheName!==CACHE_NAME)
            .map(cacheName=>caches.delete(cacheName))
        );
      })
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const request=event.request;

  if(request.method!=="GET")return;

  const url=new URL(request.url);

  if(url.origin!==location.origin)return;

  if(request.mode==="navigate"){
    event.respondWith(
      fetch(request)
        .then(response=>{
          const copy=response.clone();

          caches.open(CACHE_NAME)
            .then(cache=>cache.put(request,copy));

          return response;
        })
        .catch(()=>{
          return caches.match(request)
            .then(cached=>{
              return cached||caches.match(BASE_PATH+"index.html");
            });
        })
    );

    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached=>{
        if(cached)return cached;

        return fetch(request)
          .then(response=>{
            if(!response||response.status!==200)return response;

            const copy=response.clone();

            caches.open(CACHE_NAME)
              .then(cache=>cache.put(request,copy));

            return response;
          });
      })
  );
});
