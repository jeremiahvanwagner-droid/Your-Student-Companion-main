# Advancement 7 — Frontend Performance + Honest PWA Shell

- **File Evidence:**
  - [src/App.js:13-28](../../src/App.js) — all 16 page components imported eagerly; no `React.lazy` anywhere in `src/`. Every visitor downloads Recharts (`WeeklyReport`), the store, and the mentor to render the landing page. [market-thirteen.md §6](../strategy/market-thirteen.md) measured the result: a single ~493 KB gzip chunk against the scope's own "dashboard < 2 s" bar (Module B acceptance).
  - [src/index.js:1-17](../../src/index.js) — **no service worker registration**; the app has zero offline capability despite `manifest.json` claiming it.
  - [public/manifest.json:5,10](../../public/manifest.json) — `start_url: "/app"` with `scope: "/"` is fine, but there is no `id` field, and icons are `"purpose": "any maskable"` combos of favicon-grade art ([:16-34](../../public/manifest.json)).
  - [vercel.json:1-10](../../vercel.json) — no `headers` block: no CSP, HSTS, X-Content-Type-Options, or Referrer-Policy on the production site.
- **Current State:** Functional-but-heavy SPA with no offline story, no install story, and no security headers. The manifest's honesty problem is fixed by Advancement 3; the *structural* PWA gap (service worker, icons, headers, bundle) is this advancement.
- **Proposed Enhancement:** Route-level code splitting, a Workbox service worker with an honest offline fallback, proper maskable icons, security headers in `vercel.json`, and a Lighthouse CI budget so the bar is enforced, not aspirational.
- **Impact / Effort:** 7/10 · 5/10
- **Risk Eliminated:** Mid-tier-Android abandonment during beta (target users are students on school Wi-Fi and budget phones); a stale service worker caching a broken deploy (mitigated by design below); clickjacking/injection exposure from missing headers.
- **Mission Advancement:** Scope §1 names "optional PWA/mobile expansion" as the intended path; Module B's <2 s dashboard becomes measurable and enforced.
- **Unlocks:** **Play Store via TWA** (market-thirteen #11 hard-requires an installable PWA), install prompts, offline focus timer as a real differentiator claim.

---

## Implementation Brief

### Files to Create/Modify/Delete

| Action | Path |
|---|---|
| Modify | `src/App.js` (React.lazy + Suspense per route) |
| Modify | `craco.config.js` (InjectManifest via `workbox-webpack-plugin`) |
| Create | `src/service-worker.js`, `src/lib/swRegistration.js` |
| Modify | `src/index.js` (register SW, update toast) |
| Create | `public/offline.html` (fallback page) |
| Replace | `public/logo192.png`, `public/logo512.png` (true maskable set + monochrome) |
| Modify | `public/manifest.json` (add `id`, separate `purpose: "any"` / `"maskable"` icon entries) |
| Modify | `vercel.json` (headers block) |
| Modify | `.github/workflows/ci.yml` (Lighthouse CI job, optional gate) |
| Create | `src/__tests__/lazyRoutes.test.jsx` |

### Step-by-Step Instructions

1. **Code-split `src/App.js`:** keep `LandingPage`, `Gatekeeper`, `AppShell`, `Dashboard` eager; convert the rest:
   ```jsx
   const WeeklyReport = React.lazy(() => import("@/pages/WeeklyReport"));
   // …same for TaskManager, StudyPlanner, FocusPage, MentorPage, NotesPad,
   // StorePage, SubscribePage, UserSettings, OnboardingFlow, SearchPage,
   // ShifterPage, HomePage, NotFoundPage
   ```
   Wrap the `<Routes>` body in `<Suspense fallback={<LoadingState />}>` (component exists at [src/components/LoadingState.jsx](../../src/components/LoadingState.jsx)). Expect the main chunk to drop 50–60% — Recharts alone leaves the critical path.
2. **Service worker:** `npm i -D workbox-webpack-plugin`; in `craco.config.js` add `InjectManifest({ swSrc: "./src/service-worker.js" })` for production builds only. `src/service-worker.js`:
   - precache the webpack manifest (`self.__WB_MANIFEST`)
   - `NetworkFirst` for `/api/*` (never serve stale data), `StaleWhileRevalidate` for static assets
   - navigation fallback → `offline.html` ("You're offline — the focus timer still works when the app is cached")
   - `self.skipWaiting()` on message + versioned precache; `swRegistration.js` listens for `waiting` and shows a sonner toast "Update available — refresh" (kill-switch: an unregister path documented in [docs/runbooks/observability.md](../runbooks/observability.md)).
3. **Icons:** export 192/512 maskable PNGs with proper safe-zone padding + a monochrome icon; list `purpose: "any"` and `purpose: "maskable"` as **separate** entries (the current combined entries fail maskable audits). Add `"id": "/app"` to the manifest.
4. **Headers in `vercel.json`:**
   ```json
   "headers": [{
     "source": "/(.*)",
     "headers": [
       { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" },
       { "key": "X-Content-Type-Options", "value": "nosniff" },
       { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
       { "key": "Permissions-Policy", "value": "camera=(), geolocation=()" },
       { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://challenges.cloudflare.com; connect-src 'self' https://*.clerk.accounts.dev https://*.supabase.co https://*.ingest.us.sentry.io https://us.i.posthog.com https://api.<render-domain>; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com https://js.stripe.com" }
     ]
   }]
   ```
   **Deploy CSP in Report-Only first** (`Content-Security-Policy-Report-Only`) for one week; Clerk/Stripe/ElevenLabs endpoints must be confirmed against real traffic before enforcing.
5. **Lighthouse CI:** add a `lighthouse` job to `ci.yml` running `treosh/lighthouse-ci-action` against the Vercel preview URL with budgets: performance ≥ 85 (mobile), PWA installable, a11y ≥ 90. Start as non-blocking (`continue-on-error: true`), flip to required after two green weeks.
6. **Tests:** lazy routes still render behind Suspense (RTL with `findBy*`); prod build artifact contains `service-worker.js`; `npm run build` chunk report shows main < 250 KB gzip.

### Verification Checklist

- [ ] `npm run build` → main chunk < 250 KB gzip (report the before/after in the PR)
- [ ] Chrome DevTools → Application → Manifest: installable, no warnings; maskable icons render round
- [ ] Install on Android Chrome → correct icon/name; airplane mode → offline fallback page; back online → normal
- [ ] New deploy while app open → "Update available" toast appears; refresh gets the new build (no stale-cache trap)
- [ ] securityheaders.com scan of prod: A grade; CSP report-only console shows zero violations for a full session (sign-in → checkout → mentor)
- [ ] Lighthouse CI: performance ≥ 85, PWA pass, a11y ≥ 90 on two consecutive PRs
- [ ] Full test suites green

### Rollback Procedure

- Code split: revert the `App.js` commit — imports return to eager.
- Service worker gone wrong (the classic PWA failure): ship a kill-switch deploy where `swRegistration.js` calls `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))`, keep it live for a week. Document in the observability runbook **before** first SW deploy.
- CSP breakage: flip the header back to `Content-Security-Policy-Report-Only` (one-line `vercel.json` change) — instant un-break on next deploy.

### Definition of Done

**Lighthouse (mobile) on the production URL reports PWA installable = pass AND performance ≥ 85 AND the main JS chunk is under 250 KB gzip.**
