/* Generated with a unique build ID; do not activate updates without user consent. */
const BUILD_ID = __MEMBER_BUILD_ID__;
const CACHE_PREFIX = "member-offline-";
const CACHE_NAME = CACHE_PREFIX + BUILD_ID;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const response = await fetch(new Request(OFFLINE_URL, { cache: "reload", credentials: "omit" }));
    if (!response.ok || response.redirected) throw new Error("Offline document unavailable");
    const cache = await caches.open(CACHE_NAME);
    await cache.put(OFFLINE_URL, response);
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE" && event.source &&
      new URL(event.source.url).origin === self.location.origin) {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  // APIs, RSC, authentication, writes and cross-origin requests are never cached.
  if (request.method !== "GET" || request.mode !== "navigate" ||
      url.origin !== self.location.origin || url.pathname.startsWith("/api/") || request.headers.has("RSC")) return;
  event.respondWith((async () => {
    try { return await fetch(request); }
    catch {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(OFFLINE_URL) ?? new Response("연결을 확인해주세요.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  })());
});
