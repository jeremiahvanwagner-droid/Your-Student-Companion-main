import { isAndroidTwa, _resetPlatformForTests } from "@/lib/platform";

describe("platform: isAndroidTwa", () => {
  const originalReferrer = Object.getOwnPropertyDescriptor(Document.prototype, "referrer");

  function setReferrer(value) {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      get: () => value,
    });
  }

  afterEach(() => {
    _resetPlatformForTests();
    if (originalReferrer) {
      Object.defineProperty(Document.prototype, "referrer", originalReferrer);
    } else {
      delete document.referrer;
    }
    window.history.replaceState({}, "", "/");
  });

  it("is false in a plain browser session", () => {
    setReferrer("");
    expect(isAndroidTwa()).toBe(false);
  });

  it("detects the android-app referrer and persists for the session", () => {
    setReferrer("android-app://com.growthbychoice.ysc");
    expect(isAndroidTwa()).toBe(true);

    // Later navigation loses the referrer — the session flag keeps it true
    setReferrer("");
    expect(isAndroidTwa()).toBe(true);
  });

  it("detects the utm_source=twa start param", () => {
    setReferrer("");
    window.history.replaceState({}, "", "/app?utm_source=twa");
    expect(isAndroidTwa()).toBe(true);
  });

  it("ignores unrelated utm sources", () => {
    setReferrer("");
    window.history.replaceState({}, "", "/app?utm_source=newsletter");
    expect(isAndroidTwa()).toBe(false);
  });
});
