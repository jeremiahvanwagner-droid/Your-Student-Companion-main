# Advancement 6 — Email Layer via Resend: Weekly Reset + Onboarding Sequence

- **File Evidence:**
  - `backend/.env` contains `RESEND_API_KEY` (key name verified 2026-07-13); [CURRENT_STATE.md:34](../../CURRENT_STATE.md) — "API key live in `backend/.env` … Code wiring … not yet started." Confirmed: zero `resend` imports in `backend/`, no `backend/lib/email.py`.
  - [docs/design/app-storyboard.md:274](../../docs/design/app-storyboard.md) — "Email reminders + weekly reset email | Step 10 (Resend) | `weekly_reset` reminder type already exists in the data model; bell already renders it."
  - [backend/routes/reminders.py](../../backend/routes/reminders.py) — reminder engine exists (sync, types, idempotent upsert) but generates in-app reminders only; `weekly_reset` type is modeled but nothing ever creates one.
  - Scope Module I — email reminders are MVP-optional but the retention mitigation (§15 risk 3) explicitly names "weekly reset + reminders"; KPI W1 retention ≥ 40% (§14).
- **Current State:** A paid-for, provisioned email provider with zero sends. Users who close the tab have no re-engagement channel at all.
- **Proposed Enhancement:** `backend/lib/email.py` (Resend REST, templates, suppression), three transactional emails (welcome, onboarding-incomplete nudge, Sunday weekly reset), a cron-triggered admin endpoint that also writes the in-app `weekly_reset` reminder, and an unsubscribe preference in Settings.
- **Impact / Effort:** 7/10 · 4/10
- **Risk Eliminated:** Scope §15 risk 3 ("low retention after sign-up") left unmitigated through the beta window — the KPI tree's W1-retention target has no lever without this.
- **Mission Advancement:** Module I completes (email portion); weekly reset ritual (Module H's "Next Week Plan") gets a delivery channel.
- **Unlocks:** Beta onboarding sequence (scope §12 launch assets), grandfather email for one-time pack buyers (Step 4.5 deferred item), future dunning/transactional sends.

---

## Implementation Brief

### Files to Create/Modify/Delete

| Action | Path |
|---|---|
| Create | `backend/lib/email.py` |
| Create | `backend/templates/emails/` (welcome.html, nudge.html, weekly_reset.html — inline-CSS, text fallback) |
| Modify | `backend/routes/reminders.py` (add `POST /api/reminders/weekly-reset`, admin-token guarded) |
| Modify | `backend/routes/users.py` (welcome send on first resolve; `email_opt_out` in profile PATCH) |
| Create | `backend/migrations/010_email_preferences.sql` |
| Modify | `src/pages/UserSettings.jsx` (email preference toggle) |
| Create | `backend/tests/test_email.py`, extend `backend/tests/test_reminders.py` |
| Modify | `backend/requirements.txt` — **no change needed** (use `requests` against the Resend REST API; avoids a new pin) |
| Dashboard | Resend domain verification (SPF/DKIM/DMARC); Render Cron Job (or Supabase scheduled Edge Function) |

### Step-by-Step Instructions

1. **Migration `010_email_preferences.sql`:** add `email_opt_out boolean not null default false` and `welcome_email_sent_at timestamptz` to `student_profiles` (or `users` — match where notification prefs live today; check migration 0001 before choosing). Apply per Advancement 2's process.
2. **`backend/lib/email.py`:**
   ```python
   import os, requests, logging

   RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
   FROM_ADDRESS = os.environ.get("EMAIL_FROM", "YSC <hello@ysc.growthbychoice.com>")
   logger = logging.getLogger(__name__)

   def send_email(to: str, subject: str, html: str, text: str) -> bool:
       """Best-effort send; never raises into a request path."""
       if not RESEND_API_KEY:
           logger.info("email skipped: RESEND_API_KEY not set")
           return False
       try:
           resp = requests.post(
               "https://api.resend.com/emails",
               headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
               json={"from": FROM_ADDRESS, "to": [to], "subject": subject, "html": html, "text": text},
               timeout=10,
           )
           return resp.status_code < 300
       except requests.RequestException:
           logger.warning("email send failed", exc_info=True)
           return False
   ```
   Plus `render_template(name, **ctx)` reading from `backend/templates/emails/`, and a `should_send(profile)` gate checking `email_opt_out` and soft-deleted accounts.
3. **Welcome email:** in the users resolve path, if `welcome_email_sent_at` is null → send + stamp. Idempotent by the timestamp column.
4. **Weekly reset endpoint** in `reminders.py`:
   ```python
   @router.post("/weekly-reset")
   async def weekly_reset(request: Request):
       if request.headers.get("X-Admin-Token") != os.environ["REMINDERS_ADMIN_TOKEN"]:
           raise HTTPException(status_code=401, detail="unauthorized")
       # for each active, opted-in user whose local time is Sunday 17:00–21:00:
       #   1. upsert in-app reminder (reminder_type='weekly_reset', reference_id=week_start)
       #   2. send weekly_reset email built from last week's report snapshot (reuse reports.py aggregates)
   ```
   Reuse the idempotent upsert pattern already in `/sync` so repeated cron fires can't double-send; also stamp a `last_weekly_email_at` check before sending.
5. **Scheduler:** Render Cron Job hitting the endpoint hourly (`curl -H "X-Admin-Token: $TOKEN" -X POST https://<api>/api/reminders/weekly-reset`) — hourly + the local-time window = correct per-timezone delivery. Add `REMINDERS_ADMIN_TOKEN` to Render env and the secret inventory (Advancement 4).
6. **Onboarding nudge:** same endpoint pattern (`/api/reminders/onboarding-nudge`) or fold into the hourly job: users with `created_at > 24h`, onboarding incomplete, no nudge stamp → send once.
7. **Unsubscribe:** every template footer links to `/app/settings`; `UserSettings.jsx` gets an "Email updates" switch PATCHing `email_opt_out`. (List-Unsubscribe header: pass `headers` in the Resend payload.)
8. **DNS:** verify the sending domain in Resend (SPF/DKIM/DMARC records at the registrar) **before** any real send; sends from unverified domains land in spam and poison the domain reputation.
9. **Tests:** `send_email` no-ops without key; welcome idempotency; weekly-reset auth guard (401 without token); window logic pure-function tests (mirror `build_sync_payloads` test style).

### Verification Checklist

- [ ] Resend dashboard: domain verified, DKIM green
- [ ] Test account receives welcome on first sign-in; second sign-in sends nothing
- [ ] Manually POST `/api/reminders/weekly-reset` with token during a test user's window → email received AND bell shows the in-app `weekly_reset` reminder; immediate second POST sends nothing
- [ ] Opt-out toggle suppresses the next scheduled send
- [ ] Wrong/missing admin token → 401
- [ ] Backend suite green with new tests

### Rollback Procedure

1. Disable the Render Cron Job (pause button) — all scheduled sends stop instantly.
2. Remove `RESEND_API_KEY` from Render env — `send_email` no-ops by design; in-app reminders keep working.
3. Code rollback: revert the commit; migration 010 rollback: `ALTER TABLE student_profiles DROP COLUMN email_opt_out, DROP COLUMN welcome_email_sent_at;`

### Definition of Done

**A test account receives the weekly reset email inside its Sunday-evening local window via the cron path (not a manual send) AND toggling the Settings opt-out suppresses the following week's email.**
