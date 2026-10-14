
const CACHE_NAME = "kantinku-static-v1";

const STATIC_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (error) {
          console.warn(
            "Aset belum dapat disimpan ke cache:",
            asset,
            error
          );
        }
      }
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("kantinku-static-") &&
              key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Hanya tangani permintaan GET dari origin aplikasi.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Dokumen HTML: gunakan jaringan terlebih dahulu.
  // Jika jaringan gagal, tampilkan fallback offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (
          (await cache.match("/offline.html")) ||
          new Response("Kamu sedang offline.", {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
            },
          })
        );
      })
    );

    return;
  }

  // Aset statis: cari cache terlebih dahulu,
  // kemudian gunakan jaringan bila belum tersimpan.
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/offline.html"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request);
      })
    );
  }
});
