/**
 * PostHog product analytics (Market Thirteen #9).
 *
 * Loaded once at app boot from src/index.js. No-ops cleanly when
 * REACT_APP_POSTHOG_KEY is not set, so local dev and preview builds work
 * without credentials — the same contract as src/lib/sentry.js.
 *
 * posthog-js is ~70 KB gzip, so it is dynamic-imported OFF the critical
 * path: the main bundle stays lean, and events fired before the SDK
 * finishes loading are queued and flushed in order.
 *
 * Privacy posture (mirrors the Sentry wiring and the privacy policy):
 *   - autocapture OFF — only the explicit events below are sent
 *   - session recording OFF
 *   - identify() carries the Clerk user id ONLY — never email or name
 *   - respects Do Not Track
 */

let initialized = false;
let client = null;
let pending = [];

function withClient(fn) {
  if (!initialized) {
    return;
  }
  if (client) {
    try {
      fn(client);
    } catch {
      // Analytics must never break the app.
    }
  } else {
    pending.push(fn);
  }
}

export async function initAnalytics({
  key = process.env.REACT_APP_POSTHOG_KEY,
  host = process.env.REACT_APP_POSTHOG_HOST || "https://us.i.posthog.com",
} = {}) {
  if (initialized) {
    return true;
  }

  if (!key) {
    return false;
  }

  initialized = true;
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.init(key, {
      api_host: host,
      autocapture: false,
      capture_pageview: true,
      disable_session_recording: true,
      respect_dnt: true,
      persistence: "localStorage",
    });
    client = posthog;
    const queued = pending;
    pending = [];
    for (const fn of queued) {
      try {
        fn(client);
      } catch {
        // ignore
      }
    }
    return true;
  } catch {
    // SDK failed to load (offline, blocked) — stay silent, drop the queue.
    initialized = false;
    pending = [];
    return false;
  }
}

/**
 * Send one explicit product event. Safe no-op before init or without a key.
 * Event names are the funnel vocabulary in docs/strategy/market-thirteen.md §9.
 */
export function track(event, properties = {}) {
  if (!event) {
    return;
  }
  withClient((posthog) => posthog.capture(event, properties));
}

/** Clerk user id only — email/name never reach PostHog. */
export function identifyAnalyticsUser(clerkUserId) {
  if (!clerkUserId) {
    return;
  }
  withClient((posthog) => posthog.identify(clerkUserId));
}

/** Called on sign-out so the next user on this device starts a fresh identity. */
export function clearAnalyticsUser() {
  withClient((posthog) => posthog.reset());
}

/** Reset state for tests. Not part of the public runtime API. */
export function _resetForTests() {
  initialized = false;
  client = null;
  pending = [];
}
