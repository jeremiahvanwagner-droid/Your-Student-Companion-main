/**
 * Platform detection (Market Thirteen #11).
 *
 * The Android app is a Trusted Web Activity wrapping this site. Google
 * Play's payments policy forbids in-app flows that sell digital goods
 * outside Play Billing, so the Android build ships CONSUMPTION-ONLY:
 * inside the TWA we hide checkout CTAs entirely (no purchase buttons, no
 * "buy on the web" links — links out to external purchases are equally
 * against policy). Entitlements users already own keep working everywhere.
 *
 * Detection: Android TWAs launch with `android-app://<package>` as the
 * document referrer, and our Bubblewrap config also stamps
 * `?utm_source=twa` on the start URL. Either signal marks the session;
 * the flag persists in sessionStorage so in-app navigation keeps it.
 */

const STORAGE_KEY = "ysc_platform_twa";

export function isAndroidTwa() {
  try {
    if (window.sessionStorage.getItem(STORAGE_KEY) === "1") {
      return true;
    }

    const fromReferrer = (document.referrer || "").startsWith("android-app://");
    const fromParam = new URLSearchParams(window.location.search).get("utm_source") === "twa";

    if (fromReferrer || fromParam) {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Test hook — clears the persisted flag. */
export function _resetPlatformForTests() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
