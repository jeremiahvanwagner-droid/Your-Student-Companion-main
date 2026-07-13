/* eslint-disable no-restricted-globals */
// YSC service worker (Market Thirteen #10). Built by CRA's InjectManifest
// (react-scripts detects src/service-worker.js on production builds).
//
// Strategy:
// - Precache the app shell (build assets + index.html).
// - SPA navigations serve the precached index.html, so the shell opens
//   offline; API-backed pages then render their own error/empty states,
//   and the focus timer keeps working in an open tab.
// - /api/* is NEVER cached — always network, always fresh.
// - Same-origin images use stale-while-revalidate with a small cap.
// - Updates: the new worker waits until the page posts SKIP_WAITING
//   (surfaced to the user as a "refresh to update" toast).

import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";

clientsClaim();

// Injected at build time by workbox-webpack-plugin
precacheAndRoute(self.__WB_MANIFEST);

// App-shell routing: all navigations that aren't files or /_ paths get
// the precached index.html (React Router takes it from there).
const fileExtensionRegexp = new RegExp("/[^/?]+\\.[^/]+$");
registerRoute(({ request, url }) => {
  if (request.mode !== "navigate") return false;
  if (url.pathname.startsWith("/_")) return false;
  if (url.pathname.match(fileExtensionRegexp)) return false;
  return true;
}, createHandlerBoundToURL(process.env.PUBLIC_URL + "/index.html"));

// Same-origin images not covered by the precache manifest
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    request.destination === "image" &&
    !url.pathname.startsWith("/api/"),
  new StaleWhileRevalidate({
    cacheName: "ysc-images",
    plugins: [new ExpirationPlugin({ maxEntries: 50, purgeOnQuotaError: true })],
  })
);

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
