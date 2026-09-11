/// <reference lib="webworker" />
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
import { forgetPreparedWorkspace } from "@/lib/offline/database";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;
const precacheEntries = self.__SW_MANIFEST ?? [];

const serwist = new Serwist({
  cacheId: "fleg-static-v1",
  precacheEntries,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [], // In particular: no default Next.js HTML/RSC/API caching.
  precacheOptions: {
    cleanupOutdatedCaches: true,
    navigateFallback: "/offline",
    navigateFallbackAllowlist: [/^\/offline(?:\?|$)/],
    cleanURLs: false,
  },
});

// Intercept authentication changes before sending them. A failed login also
// invalidates the disposable copy. The epoch fences an in-flight preparation.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/api/auth/") &&
    event.request.method !== "GET"
  ) {
    event.respondWith(
      (async () => {
        await forgetPreparedWorkspace();
        return fetch(event.request);
      })(),
    );
  }
});

serwist.addEventListeners();

self.addEventListener("message", (event) => {
  const data: unknown = event.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("type" in data) ||
    data.type !== "FIELD_SHELL_STATUS" ||
    !event.ports[0]
  )
    return;
  event.waitUntil(
    (async () => {
      const available = await Promise.all(
        precacheEntries.map((entry) =>
          serwist.matchPrecache(typeof entry === "string" ? entry : entry.url),
        ),
      );
      event.ports[0].postMessage({
        ready: precacheEntries.length > 0 && available.every(Boolean),
      });
    })(),
  );
});
