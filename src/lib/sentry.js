/**
 * Sentry frontend integration.
 *
 * Loaded once at app boot from src/index.js. No-ops cleanly when
 * REACT_APP_SENTRY_DSN is not set, so local dev and the marketing-preview
 * builds (SKIP_ENV_CHECK=true) keep working without Sentry credentials.
 *
 * PII handling: scrubPII strips Clerk emails and Authorization headers from
 * every event before it leaves the browser. Sentry's default integrations
 * would otherwise capture both from the Clerk SDK's network breadcrumbs.
 */

import * as Sentry from "@sentry/react";

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

let initialized = false;

/**
 * Strip personally-identifiable information from a Sentry event before it
 * leaves the browser.
 *
 * Removes:
 *   - user.email / user.username / user.ip_address  (we only want user.id)
 *   - request.headers.Authorization / Cookie         (bearer tokens, session cookies)
 *   - request.cookies                                 (raw cookie object Sentry sometimes attaches)
 *
 * Returns the mutated event so it can be sent. Returning null would drop the
 * event entirely, which we don't want — we want errors reported, just not the
 * PII fields on them.
 */
export function scrubPII(event) {
  if (!event) {
    return event;
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }

  if (event.request) {
    if (event.request.headers) {
      // Header names from various sources arrive with inconsistent casing.
      // Strip every casing variant we have seen for Authorization + Cookie.
      for (const name of Object.keys(event.request.headers)) {
        const lower = name.toLowerCase();
        if (lower === "authorization" || lower === "cookie") {
          delete event.request.headers[name];
        }
      }
    }
    if (event.request.cookies) {
      delete event.request.cookies;
    }
  }

  return event;
}

/**
 * Initialize Sentry. Safe to call multiple times — subsequent calls no-op.
 * Reads configuration from process.env so it works under both CRA's build-time
 * substitution and the prebuild env check.
 *
 * Returns true if Sentry was initialized, false if it was skipped (no DSN).
 */
export function initSentry({
  dsn = process.env.REACT_APP_SENTRY_DSN,
  environment = process.env.REACT_APP_VERCEL_ENV || process.env.NODE_ENV || "development",
  release = process.env.REACT_APP_VERCEL_GIT_COMMIT_SHA || undefined,
  tracesSampleRate = DEFAULT_TRACES_SAMPLE_RATE,
} = {}) {
  if (initialized) {
    return true;
  }

  if (!dsn) {
    // Soft no-op. The prebuild check warns about this; we don't crash the app.
    return false;
  }

  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate,
    // Default integrations include BrowserTracing + Breadcrumbs + GlobalHandlers.
    // We don't need session replay yet — that's a separate cost+privacy decision.
    sendDefaultPii: false,
    beforeSend: scrubPII,
  });

  initialized = true;
  return true;
}

/**
 * Identify the currently signed-in Clerk user on the Sentry scope so all
 * subsequent errors carry the Clerk user id (not the email — see scrubPII).
 *
 * Safe to call repeatedly; safe to call before initSentry (Sentry's API
 * tolerates setUser calls when the SDK is uninitialized — they become no-ops).
 */
export function identifySentryUser(clerkUserId) {
  if (!clerkUserId) {
    return;
  }
  Sentry.setUser({ id: clerkUserId });
}

/**
 * Clear the Sentry user scope. Called from Gatekeeper when an unauthenticated
 * session resolves, so a subsequent sign-in on the same device doesn't inherit
 * the previous user's id on Sentry events.
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Reset state for tests. Not part of the public runtime API.
 */
export function _resetForTests() {
  initialized = false;
}
