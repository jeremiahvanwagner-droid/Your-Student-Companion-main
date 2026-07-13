// Unit tests for the Sentry frontend integration.
//
// scrubPII is the high-stakes one: it's the last line of defense before any
// Clerk email or Authorization header would leave the browser inside a Sentry
// event payload. If this regresses, every captured error carries PII.

import { scrubPII, initSentry, _resetForTests } from "@/lib/sentry";

describe("scrubPII", () => {
  it("removes user.email", () => {
    const event = { user: { id: "user_abc123", email: "a@b.com" } };
    const scrubbed = scrubPII(event);
    expect(scrubbed.user).toEqual({ id: "user_abc123" });
  });

  it("removes user.username", () => {
    const event = { user: { id: "user_abc123", username: "screenname" } };
    const scrubbed = scrubPII(event);
    expect(scrubbed.user).toEqual({ id: "user_abc123" });
  });

  it("removes user.ip_address", () => {
    const event = { user: { id: "user_abc123", ip_address: "192.0.2.1" } };
    const scrubbed = scrubPII(event);
    expect(scrubbed.user).toEqual({ id: "user_abc123" });
  });

  it("preserves user.id (the only field we want to keep)", () => {
    const event = { user: { id: "user_abc123", email: "a@b.com", username: "x" } };
    const scrubbed = scrubPII(event);
    expect(scrubbed.user.id).toBe("user_abc123");
  });

  it("removes Authorization header regardless of casing", () => {
    const event = {
      request: {
        headers: {
          Authorization: "Bearer secret-token",
          "Content-Type": "application/json",
        },
      },
    };
    const scrubbed = scrubPII(event);
    expect(scrubbed.request.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("removes lowercase authorization header", () => {
    const event = {
      request: {
        headers: {
          authorization: "Bearer secret-token",
          "content-type": "application/json",
        },
      },
    };
    const scrubbed = scrubPII(event);
    expect(scrubbed.request.headers).toEqual({ "content-type": "application/json" });
  });

  it("removes Cookie header", () => {
    const event = {
      request: {
        headers: { Cookie: "session=abc", "Content-Type": "application/json" },
      },
    };
    const scrubbed = scrubPII(event);
    expect(scrubbed.request.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("removes request.cookies object", () => {
    const event = {
      request: {
        cookies: { session: "abc", csrf: "xyz" },
        url: "https://example.com",
      },
    };
    const scrubbed = scrubPII(event);
    expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.request.url).toBe("https://example.com");
  });

  it("returns the event (does not drop) so the error is still reported", () => {
    const event = { user: { id: "x", email: "a@b.com" } };
    expect(scrubPII(event)).not.toBeNull();
    expect(scrubPII(event)).toBeDefined();
  });

  it("tolerates events without user or request blocks", () => {
    const event = { exception: { values: [{ type: "Error" }] } };
    expect(() => scrubPII(event)).not.toThrow();
    const scrubbed = scrubPII(event);
    expect(scrubbed.exception).toBeDefined();
  });

  it("tolerates null/undefined input", () => {
    expect(scrubPII(null)).toBeNull();
    expect(scrubPII(undefined)).toBeUndefined();
  });
});

describe("initSentry", () => {
  // craco test loads .env.local, so a developer's real REACT_APP_SENTRY_DSN
  // would leak into the default-parameter path and flip the "no DSN" cases.
  const savedDsn = process.env.REACT_APP_SENTRY_DSN;

  beforeEach(() => {
    _resetForTests();
    delete process.env.REACT_APP_SENTRY_DSN;
  });

  afterAll(() => {
    if (savedDsn !== undefined) {
      process.env.REACT_APP_SENTRY_DSN = savedDsn;
    }
  });

  it("returns false when no DSN is provided", () => {
    const result = initSentry({ dsn: undefined });
    expect(result).toBe(false);
  });

  it("returns false when DSN is empty string", () => {
    const result = initSentry({ dsn: "" });
    expect(result).toBe(false);
  });

  it("returns true on first init when a DSN is provided", () => {
    const result = initSentry({
      dsn: "https://abc@o1.ingest.sentry.io/1",
      environment: "test",
    });
    expect(result).toBe(true);
  });

  it("is idempotent — second call returns true without re-initializing", () => {
    initSentry({ dsn: "https://abc@o1.ingest.sentry.io/1", environment: "test" });
    const result = initSentry({ dsn: "https://abc@o1.ingest.sentry.io/1", environment: "test" });
    expect(result).toBe(true);
  });
});
