# Advancement 3 — Truth & Legal Pack: Honesty Sweep + /privacy + /terms + Account Deletion

- **File Evidence:**
  - [src/pages/LandingPage.jsx:681](../../src/pages/LandingPage.jsx) — "Join 50,000+ students today" — **fabricated user count** (the aggregateRating twin of this claim was already removed in PR #8; the copy version remains).
  - [src/pages/LandingPage.jsx:90-91,98,169,377,461,506,748](../../src/pages/LandingPage.jsx) — repeated "offline dictionary" claims; the app has no service worker and no offline capability (verified: no SW registration in [src/index.js](../../src/index.js)).
  - [src/pages/LandingPage.jsx:236](../../src/pages/LandingPage.jsx) — fabricated testimonial praising the (nonexistent) offline dictionary.
  - [src/pages/LandingPage.jsx:258-259](../../src/pages/LandingPage.jsx) — FAQ answer claims "Premium Course Packs include full offline dictionary support" — false.
  - [public/manifest.json:4](../../public/manifest.json) — "offline dictionary. No subscription required." — false on both counts (subscriptions shipped in Step 4: $7.99/$14.99 tiers).
  - [public/index.html:103](../../public/index.html) ("No subscription required"), [:152](../../public/index.html) ("100% free with no subscription required"), [:176](../../public/index.html) ("without any subscription") — Schema.org SoftwareApplication + FAQPage blocks repeat the false claims to Google.
  - [src/App.js:109-134](../../src/App.js) — route table has **no `/privacy` or `/terms`**; scope §8 requires Privacy Policy, Terms of Service, and a data-deletion request flow; Play Console requires a privacy policy URL.
  - [backend/routes/users.py](../../backend/routes/users.py) — no `DELETE /api/users/me` endpoint exists.
- **Current State:** A public site collecting minors' study data (email, grade, study activity, AI chat logs via `ai_interactions`) with fabricated social proof, materially false product claims in HTML/manifest/copy, and zero legal pages.
- **Proposed Enhancement:** One honesty sweep commit (copy + schema + manifest), then legal pages as public routes linked from the footer, then a real account-deletion flow (backend endpoint + Settings UI).
- **Impact / Effort:** 9/10 · 3/10
- **Risk Eliminated:** Google manual-action/rich-result suppression for deceptive structured data; FTC/consumer-protection exposure for fabricated claims; Play Store listing rejection; privacy-law exposure while handling minors' data.
- **Mission Advancement:** Scope §8 compliance items done; trust posture matches the "supportive, honest companion" brand.
- **Unlocks:** Advancement 7 (manifest must be honest before PWA/TWA work), Play Console Data Safety form (needs the privacy inventory), beta recruitment with a straight face.

---

## Implementation Brief

### Files to Create/Modify/Delete

| Action | Path |
|---|---|
| Modify | `src/pages/LandingPage.jsx` (all lines listed above) |
| Modify | `public/manifest.json` (description) |
| Modify | `public/index.html` (SoftwareApplication description, FAQPage answers) |
| Create | `src/pages/PrivacyPolicy.jsx` |
| Create | `src/pages/TermsOfService.jsx` |
| Modify | `src/App.js` (two public routes) |
| Modify | `src/components/Footer.jsx` (legal links) |
| Modify | `backend/routes/users.py` (`DELETE /api/users/me`) |
| Modify | `src/pages/UserSettings.jsx` (Delete Account section) |
| Create | `backend/tests/test_account_deletion.py` |
| Create | `src/__tests__/LegalPages.test.jsx` |

### Step-by-Step Instructions

**Part A — Honesty sweep (do first; it is one commit, ~1 hour)**

1. In `LandingPage.jsx`: replace every "offline dictionary" with "instant dictionary"; delete "No subscription required" and replace with "Free plan available"; change "Join 50,000+ students today" to a claim that is true (e.g. "Built for students, free to start"); delete or rewrite the line-236 testimonial (no fabricated testimonials — remove the block or replace with a real beta quote later); fix the line-258-259 FAQ answer to match the truthful answer already in `public/index.html:168` ("Offline mode is in development…").
2. In `public/manifest.json:4`: new description — `"Study planner, focus timer, notes with spaced repetition, and an AI study mentor. Free plan available; optional subscriptions unlock course packs."`
3. In `public/index.html`: align `:103` SoftwareApplication description with the manifest text; fix FAQPage answers `:152` and `:176` to say "Free plan available; optional paid course packs and subscriptions."
4. Guard against regression — the Definition of Done grep (below) can be added as a CI step later; for now run it manually before commit.

**Part B — Legal pages**

5. Create `PrivacyPolicy.jsx` and `TermsOfService.jsx` as simple prose pages using the existing typography (`prose`-style sections, dark theme). Privacy Policy must cover, per [market-thirteen.md §5](../strategy/market-thirteen.md): data collected (email, display name, grade, study activity, AI chat logs), processors (Clerk, Supabase, Stripe, OpenAI, ElevenLabs, Sentry, PostHog, Resend), retention, the deletion request flow (Part C + fallback email), and a children's-privacy section declaring the 13+ posture.
6. Register public routes in `src/App.js` beside `/landing` (outside the auth guard):
   ```jsx
   <Route path="/privacy" element={<PrivacyPolicy />} />
   <Route path="/terms" element={<TermsOfService />} />
   ```
   Also add them to the no-Clerk dev fallback block ([App.js:190-199](../../src/App.js)) so marketing preview builds can render them.
7. Link both from `Footer.jsx` and from the landing page footer section.

**Part C — Account deletion**

8. Add to `backend/routes/users.py`:
   ```python
   @router.delete("/me", status_code=202)
   @limiter.limit("3/hour")
   async def delete_my_account(request: Request, auth: AppAuthContext = Depends(get_app_auth_context)):
       admin = get_supabase_admin_client()
       # 1. cancel active Stripe subscription (ignore if none)
       # 2. purge ai_interactions rows for the user
       # 3. soft-delete users row (deleted_at) — FK cascades cover owned rows on hard delete later
       # 4. revoke the Clerk user via Clerk Backend API (requests + CLERK_SECRET_KEY)
       # 5. write an audit_logs row
   ```
   Follow the existing route idioms in `users.py` (admin client, HTTPException mapping). Stripe cancel: look up `user_subscriptions` for an active `stripe_subscription_id`, call `stripe.Subscription.cancel`.
9. `UserSettings.jsx`: add a "Danger zone" card — typed confirmation ("delete my account"), calls the endpoint via `apiClient.js` helpers, then signs out via Clerk and routes to `/landing`.
10. Tests: backend — deletion happy path, unauthenticated 401, idempotent second call; frontend — legal pages render + confirmation gate disables the button until the phrase matches.

### Verification Checklist

- [ ] `grep -riE "offline dictionary|no subscription required|50,000|50000" src/ public/` → **zero matches**
- [ ] https://ysc.growthbychoice.com/privacy and `/terms` return 200 and render
- [ ] Google Rich Results Test on the landing URL: no deceptive-claim FAQ answers
- [ ] Staging: delete a test account → `users.deleted_at` set, `ai_interactions` purged, Clerk session dead, Stripe sub (if any) cancelled, audit row exists
- [ ] Full test suites green (`npm run test:coverage`, backend pytest)

### Rollback Procedure

- Parts A/B are pure content/routing: `git revert` the commit(s). No data implications.
- Part C: the endpoint is additive — revert the commit to remove it. For an accidentally deleted account during testing: restore `deleted_at = NULL` on the `users` row; purged `ai_interactions` are not recoverable (that is the point of the feature) — test only with fixture accounts.

### Definition of Done

**`grep -riE "offline dictionary|no subscription required|50,000" src/ public/` returns zero matches AND /privacy + /terms return HTTP 200 in production AND a staging account deletion completes end-to-end (row soft-deleted, Clerk revoked).**
