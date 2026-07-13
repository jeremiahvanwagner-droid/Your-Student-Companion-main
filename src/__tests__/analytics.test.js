const mockInit = jest.fn();
const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockReset = jest.fn();

jest.mock("posthog-js", () => ({
  __esModule: true,
  default: {
    init: (...args) => mockInit(...args),
    capture: (...args) => mockCapture(...args),
    identify: (...args) => mockIdentify(...args),
    reset: (...args) => mockReset(...args),
  },
}));

import {
  initAnalytics,
  track,
  identifyAnalyticsUser,
  clearAnalyticsUser,
  _resetForTests,
} from "@/lib/analytics";

describe("analytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetForTests();
  });

  it("no-ops without a key", async () => {
    await expect(initAnalytics({ key: undefined })).resolves.toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("initializes with privacy-safe options", async () => {
    await expect(
      initAnalytics({ key: "phc_test", host: "https://ph.example.com" })
    ).resolves.toBe(true);

    expect(mockInit).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://ph.example.com",
        autocapture: false,
        disable_session_recording: true,
        respect_dnt: true,
      })
    );
  });

  it("init is idempotent", async () => {
    await initAnalytics({ key: "phc_test" });
    await initAnalytics({ key: "phc_test" });
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it("track no-ops before init", () => {
    track("task_create");
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("track captures after init", async () => {
    await initAnalytics({ key: "phc_test" });
    track("task_create", { has_due_date: true });
    expect(mockCapture).toHaveBeenCalledWith("task_create", { has_due_date: true });
  });

  it("events fired while the SDK loads are queued and flushed in order", async () => {
    const ready = initAnalytics({ key: "phc_test" });
    track("first", {});
    track("second", {});
    await ready;

    expect(mockCapture).toHaveBeenNthCalledWith(1, "first", {});
    expect(mockCapture).toHaveBeenNthCalledWith(2, "second", {});
  });

  it("identify sends the Clerk id only", async () => {
    identifyAnalyticsUser("user_123"); // before init → dropped
    expect(mockIdentify).not.toHaveBeenCalled();

    await initAnalytics({ key: "phc_test" });
    identifyAnalyticsUser("user_123");
    expect(mockIdentify).toHaveBeenCalledWith("user_123");
  });

  it("clear resets the identity after init", async () => {
    await initAnalytics({ key: "phc_test" });
    clearAnalyticsUser();
    expect(mockReset).toHaveBeenCalled();
  });

  it("capture failures never propagate", async () => {
    await initAnalytics({ key: "phc_test" });
    mockCapture.mockImplementation(() => {
      throw new Error("network down");
    });
    expect(() => track("task_create")).not.toThrow();
  });
});
