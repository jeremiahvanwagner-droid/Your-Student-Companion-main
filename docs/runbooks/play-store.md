# Runbook — Google Play Packaging (TWA)

**Market Thirteen #11.** The Android app is a Trusted Web Activity wrapping
`https://ysc.growthbychoice.com`, built with Bubblewrap from the repo's
`twa-manifest.json`. **Policy posture locked in the plan:** consumption-only
(no purchase flows or external purchase links inside the app — enforced in
code via `src/lib/platform.js`) and **13+ target audience** (enforced by the
AgeGate; keeps us outside the Designed-for-Families program until counsel
reviews it).

## 0. Prerequisites
- Production site live on the custom domain with the PWA green (service
  worker registered, manifest valid, icons loading) — Lighthouse PWA pass.
- Play Console developer account ($25 one-time).
- JDK 17 + Android SDK build tools (Bubblewrap installs its own if missing).

## 1. Build the app bundle
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://ysc.growthbychoice.com/manifest.json \
  --config ./twa-manifest.json        # reuses the committed config
bubblewrap build                       # produces app-release-bundle.aab
```
Bubblewrap generates `android.keystore` on first build — **back it up in the
password vault immediately**; losing it means losing the Play listing.

## 2. Digital Asset Links (removes the browser bar)
1. Extract the release fingerprint:
   ```bash
   keytool -list -v -keystore android.keystore -alias ysc-release | grep SHA256
   ```
2. Paste it into `public/.well-known/assetlinks.json` (replacing
   `REPLACE_WITH_RELEASE_KEY_SHA256_FINGERPRINT`), commit, deploy.
3. Verify: `https://ysc.growthbychoice.com/.well-known/assetlinks.json`
   serves raw JSON (the vercel.json rewrite already excludes `.well-known`),
   then run Google's statement-list checker or `bubblewrap validate`.
4. If Play App Signing re-signs the app (default), ALSO add the App Signing
   key fingerprint from Play Console → Setup → App integrity.

## 3. Play Console checklist
| Item | Source |
|---|---|
| App name | "Your Student Companion: Study & Focus" (≤30 chars: "Your Student Companion") |
| Short description | from the honesty-swept landing hero (≤80 chars, no unverifiable claims) |
| Full description | landing feature copy — run the same honesty sweep rules |
| Screenshots | capture from the PWA on a phone (dashboard, tasks, planner, focus, notes) |
| Feature graphic | 1024×500 from the brand assets |
| Privacy policy URL | `https://ysc.growthbychoice.com/privacy` |
| App category | Education |
| Content rating (IARC) | questionnaire — no violence/gambling/UGC-sharing; AI chat = "users can interact" YES |
| Target audience | **13–17 and 18+** (NOT under-13 — avoids Families program) |
| Ads | None |

## 4. Data Safety form (crib from /privacy — keep them in sync)
| Question | Answer |
|---|---|
| Collects personal info | Yes — email (account), name (optional display name) |
| App activity | Yes — in-app actions (analytics events, account-linked) |
| Messages | Yes — AI mentor chats (app functionality, account-linked) |
| Financial info | No (Stripe processes payments on the web, outside the app) |
| Location / contacts / photos | No |
| Data shared with third parties | Processors only (Clerk, Supabase, OpenAI, ElevenLabs, Sentry, PostHog) — declare as "data processed ephemerally / service providers" per current form guidance |
| Encrypted in transit | Yes |
| Deletion mechanism | Yes — in-app (Settings → Danger Zone) + policy contact |

## 5. Payments policy — why the app has no checkout
Digital goods sold inside a Play-distributed app must use Play Billing.
Rather than integrate it for v1, the TWA ships consumption-only:
- `src/lib/platform.js` detects the TWA (referrer `android-app://` or the
  `utm_source=twa` start-URL param, persisted per session).
- Store/Subscribe nav entries are hidden; checkout buttons render neutral
  "not available in this app" copy with **no link out** (linking to an
  external purchase flow violates the same policy).
- Everything a user owns (packs, subscription entitlements) works normally.
Revisit Play Billing or user-choice billing as a Phase-2 decision if Android
revenue matters.

## 6. Rollout
1. **Internal testing** track first: upload the `.aab`, add your own account,
   confirm no browser bar (assetlinks OK) + commerce surfaces hidden.
2. **Closed testing** with the beta cohort (Market Thirteen #13) ≥1 release.
3. Production with **staged rollout 20% → 100%**, watching Sentry + Play
   vitals between stages.

## Release updates
The TWA is a thin wrapper — web deploys ship instantly with no Play review.
Only bump `appVersionCode`/`appVersionName` in `twa-manifest.json` and
rebuild when the wrapper itself changes (icons, name, start URL, Android
target SDK requirements — Play raises the minimum yearly).
