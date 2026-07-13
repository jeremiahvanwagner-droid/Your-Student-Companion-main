# Runbook — Service Worker (PWA shell)

**Market Thirteen #10.** Production builds ship a Workbox service worker
(`src/service-worker.js`, built by CRA's InjectManifest) registered from
`src/index.js` via `src/serviceWorkerRegistration.js`.

## Behavior
- **Precache:** all build assets + `index.html` (the app shell).
- **Navigations:** served from the precached shell → the app opens offline;
  API-backed pages render their normal error/empty states; the focus timer
  keeps working in an open tab. No feature claims beyond this.
- **`/api/*`:** never cached. Always network.
- **Images:** same-origin, stale-while-revalidate, max 50 entries.
- **Updates:** the new worker installs and *waits*. The running app shows a
  persistent "Update available → Refresh" toast; accepting posts
  `SKIP_WAITING` and reloads. No silent version skew.

## Verifying a deploy
1. Load the prod site → DevTools → Application → Service Workers: one
   activated worker, source `service-worker.js`.
2. DevTools → Network → Offline → reload: shell renders (dashboard shows its
   error states rather than a browser dinosaur).
3. Ship any change → revisit tab → "Update available" toast appears within a
   minute of the SW update check; Refresh loads the new build hash.

## Kill switch (cache poisoning / broken deploy)
1. Replace `src/service-worker.js` with the no-op self-destroying worker:
   ```js
   self.addEventListener("install", () => self.skipWaiting());
   self.addEventListener("activate", async () => {
     const keys = await caches.keys();
     await Promise.all(keys.map((k) => caches.delete(k)));
     const clients = await self.clients.matchAll({ type: "window" });
     clients.forEach((c) => c.navigate(c.url));
   });
   ```
2. Deploy. Every client picks it up on next visit, purges caches, reloads.
3. Root-cause, fix, restore the real worker in a follow-up deploy.

## Local development
The worker registers only in `NODE_ENV=production`. To test locally:
`SKIP_ENV_CHECK=true npm run build && npx serve -s build` then open the
served port. Unregister via DevTools → Application → Service Workers.
