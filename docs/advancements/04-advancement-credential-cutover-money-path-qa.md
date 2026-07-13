# Advancement 4 — Production Credential Cutover + Money-Path QA

- **File Evidence:**
  - [CURRENT_STATE.md:28](../../CURRENT_STATE.md) — Stripe in **Test** mode (`sk_test_51Ta…`); [:30](../../CURRENT_STATE.md) — Clerk on `pk_test_…`.
  - [CURRENT_STATE.md:31](../../CURRENT_STATE.md) — Sentry "NOT yet activated in prod — depends on … Vercel env var population"; the four vars are enumerated at [:59-64](../../CURRENT_STATE.md) and PR #7/#8 code is already merged.
  - [CURRENT_STATE.md:76](../../CURRENT_STATE.md) — "Next-Ten #3 — Manual subscription QA pass of STORE_WEBHOOK_RUNBOOK.md §12" — flagged since 2026-05-24, never executed.
  - [backend/STORE_WEBHOOK_RUNBOOK.md](../../backend/STORE_WEBHOOK_RUNBOOK.md) §12 — the written QA checklist that has never been run.
  - [backend/scripts/create_stripe_products.py](../../backend/scripts/create_stripe_products.py) + [create_stripe_subscriptions.py](../../backend/scripts/create_stripe_subscriptions.py) — the exact tooling that will recreate 56 packs + 2 subs + 4 prices in Live mode.
- **Current State:** Auth and payments run entirely on test credentials (deliberate build-phase posture). Frontend Sentry is merged but dormant in production for lack of four Vercel env vars. The revenue flow has never been QA'd even in Test mode.
- **Proposed Enhancement:** Three-stage cutover: (1) activate Sentry in prod (15 minutes, do immediately), (2) run the full §12 manual QA in Test mode against the newly deployed backend, (3) promote Clerk + Stripe to production instances with webhook re-pointing and key rotation.
- **Impact / Effort:** 9/10 · 4/10
- **Risk Eliminated:** Shipping an untested payment flow to early adopters (the fastest way to burn trust); flying blind in prod without error reporting; duplicate entitlements from webhook replay.
- **Mission Advancement:** Converts the Step 3/4 subscription machinery into an actual business; observability live for the beta.
- **Unlocks:** Advancement 13 of Market Thirteen (beta), real revenue, Stripe Live webhook ledger, trustworthy error budgets for the go/no-go gate.

---

## Implementation Brief

### Files to Create/Modify/Delete

| Action | Path |
|---|---|
| Dashboard | Vercel env: `REACT_APP_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG_SLUG`, `SENTRY_PROJECT_SLUG` (Production scope) |
| Dashboard | Clerk production instance; Stripe Live activation + webhook destination |
| Run (no edit) | `backend/scripts/create_stripe_products.py`, `create_stripe_subscriptions.py` against Live keys |
| Run (no edit) | `backend/scripts/validate_supabase_webhook.py` against the Live webhook |
| Modify | `docs/runbooks/observability.md` (record prod DSN activation date) |
| Create | `docs/runbooks/secret-inventory.md` (every secret: name, where it lives, who can read it) |
| Modify | `CURRENT_STATE.md` (S-OBS-CLOSE-001 + QA audit rows) |

### Step-by-Step Instructions

**Stage 1 — Sentry activation (do first, independent of everything):**
1. Add the four env vars to Vercel Production scope (values already in `.env.local`/`backend/.env`). Redeploy.
2. Run the smoke test from [docs/runbooks/observability.md §8](../runbooks/observability.md): sign in on prod, throw an error in devtools, confirm the event lands in Sentry within 1 minute with Clerk user id + request_id tag and **no email** in the JSON.
3. Append audit row **S-OBS-CLOSE-001** to CURRENT_STATE.md (its checklist at :58-68 is then fully satisfied — Better Stack alert verification is step 4 there).

**Stage 2 — Money-path QA in Test mode (requires Advancement 1 deployed):**
4. Execute [STORE_WEBHOOK_RUNBOOK.md §12](../../backend/STORE_WEBHOOK_RUNBOOK.md) end-to-end with the `4242 4242 4242 4242` card: subscribe monthly + annual on both tiers; verify trial-only-on-first-subscription rule; cancel → access persists until period end; billing portal round-trip; pack gating with an active sub; `stripe_webhook_events` ledger shows exactly-once processing.
5. Webhook replay test: use Stripe dashboard "Resend" on a processed event → assert no duplicate row in `user_subscriptions` (idempotency table from Step 3 must absorb it).
6. Attach screenshots/log excerpts to a GitHub issue titled "Money-path QA §12 — <date>"; fix anything that breaks before Stage 3.

**Stage 3 — Live cutover (only after Stages 1–2 pass):**
7. **Clerk:** create production instance; configure `ysc.growthbychoice.com` + redirect URLs; swap `REACT_APP_CLERK_PUBLISHABLE_KEY` (Vercel) and `CLERK_SECRET_KEY` (Render); verify backend JWKS resolution against the prod issuer (sign in, call `/api/users/me`).
8. **Stripe:** activate Live mode; run the two product-creation scripts with Live keys (56 one-time + 2 subs + 4 prices); create the Live webhook destination pointing at the Supabase Edge function (same 7 events as Test, [CURRENT_STATE.md:29](../../CURRENT_STATE.md)); sync `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to both the Render backend env and the Edge function secrets; run `validate_supabase_webhook.py` → PASS.
9. **Live smoke purchase:** buy the cheapest pack with a real card for ~$0.50-equivalent (or 100%-off promo code), confirm entitlement appears, then refund via the Stripe dashboard.
10. **Rotate** any key that ever left the vault (the Windows env-var collision incident means `SUPABASE_*` values have floated around — rotate the service-role key last, updating Render + Edge function in the same window). Write `docs/runbooks/secret-inventory.md`.

### Verification Checklist

- [ ] Sentry prod event with request_id + Clerk id, zero PII
- [ ] §12 checklist 100% ticked with evidence attached to the issue
- [ ] Webhook replay produces zero duplicate entitlements
- [ ] Real sign-up on prod domain with production Clerk
- [ ] Live purchase → entitlement → refund cycle clean; `stripe_webhook_events` ledger row present
- [ ] Secret inventory doc lists every credential and its single source of truth

### Rollback Procedure

- Stage 1: remove the four Vercel vars, redeploy — Sentry no-ops cleanly by design ([.env.example:24](../../.env.example)).
- Stage 3 Clerk: swap the publishable/secret keys back to the `pk_test_`/`sk_test_` pair — test-mode users are unaffected.
- Stage 3 Stripe: switch the Vercel/Render/Edge keys back to Test; disable (don't delete) the Live webhook destination; Live products can remain — they're invisible while the app holds Test keys.
- Never roll back mid-purchase: check the Stripe dashboard for in-flight checkout sessions first.

### Definition of Done

**STORE_WEBHOOK_RUNBOOK §12 checklist is fully ticked with evidence attached AND a Live-mode purchase→entitlement→refund cycle completes with exactly one `stripe_webhook_events` ledger row per event.**
