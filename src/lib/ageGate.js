/**
 * ageGate.js — pure, framework-free helpers for the 13+ launch age gate.
 *
 * Launch decision (2026-07-13): YSC ships 13+. A hard age gate blocks under-13
 * signups; the full COPPA build (verifiable parental consent, parental portal,
 * deletion pipeline) is a deferred post-launch workstream. See
 * docs/full-project-technical-outline.md §1 and §7, and the YSC_ROADMAP.md
 * Decision Record (2026-07-13).
 *
 * PRIVACY / DATA MINIMIZATION: we deliberately do NOT persist the raw date of
 * birth. The gate collects DOB in-memory only to compute a coarse age bracket,
 * then stores ONLY the bracket + a timestamp. This keeps us from retaining a
 * child's birth date and aligns with the "minimal PII from day one" posture in
 * the roadmap risk register.
 */

export const MIN_AGE = 13;
export const MINOR_MAX_AGE = 17;

// Key under Clerk's client-writable `user.unsafeMetadata`.
export const AGE_GATE_METADATA_KEY = "ageGate";

export const AGE_BRACKET = Object.freeze({
  UNDER_13: "under_13",
  MINOR_13_17: "minor_13_17",
  ADULT_18_PLUS: "adult_18_plus",
});

/**
 * Compute integer age in whole years from an ISO `YYYY-MM-DD` birth date.
 * Returns null for missing/malformed/non-real dates (e.g. 2011-02-31) or a
 * future date. Constructing with numeric parts and round-tripping the
 * components rejects impossible calendar dates that Date would otherwise roll
 * over silently.
 */
export function calculateAge(dobIso, now = new Date()) {
  if (typeof dobIso !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobIso.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
  const day = Number(match[3]); // 1-31

  const dob = new Date(year, month - 1, day);
  // Reject rolled-over dates (Feb 31 -> Mar 3, etc.)
  if (
    dob.getFullYear() !== year ||
    dob.getMonth() !== month - 1 ||
    dob.getDate() !== day
  ) {
    return null;
  }

  if (dob.getTime() > now.getTime()) return null; // future DOB

  let age = now.getFullYear() - year;
  const hasHadBirthdayThisYear =
    now.getMonth() > month - 1 ||
    (now.getMonth() === month - 1 && now.getDate() >= day);
  if (!hasHadBirthdayThisYear) age -= 1;

  return age;
}

export function bracketForAge(age) {
  if (age == null || Number.isNaN(age) || age < 0) return null;
  if (age < MIN_AGE) return AGE_BRACKET.UNDER_13;
  if (age <= MINOR_MAX_AGE) return AGE_BRACKET.MINOR_13_17;
  return AGE_BRACKET.ADULT_18_PLUS;
}

export function bracketForDob(dobIso, now = new Date()) {
  return bracketForAge(calculateAge(dobIso, now));
}

/**
 * Interpret the stored age-gate metadata into a decision the UI can branch on.
 * Unknown/missing -> not checked (show the form).
 */
export function readAgeGate(unsafeMetadata) {
  const data =
    unsafeMetadata && typeof unsafeMetadata === "object"
      ? unsafeMetadata[AGE_GATE_METADATA_KEY]
      : null;

  const bracket = data && typeof data === "object" ? data.bracket ?? null : null;
  const known = Object.values(AGE_BRACKET).includes(bracket);

  return {
    checked: known,
    bracket: known ? bracket : null,
    eligible: bracket === AGE_BRACKET.MINOR_13_17 || bracket === AGE_BRACKET.ADULT_18_PLUS,
    blocked: bracket === AGE_BRACKET.UNDER_13,
    isMinor: bracket === AGE_BRACKET.MINOR_13_17,
    checkedAt: data && typeof data === "object" ? data.checkedAt ?? null : null,
  };
}

/**
 * Build the minimal metadata payload to persist for a submitted DOB.
 * Returns null when the DOB is invalid so callers can surface a form error
 * instead of writing junk. Never includes the raw DOB.
 */
export function buildAgeGateMetadata(dobIso, now = new Date()) {
  const bracket = bracketForDob(dobIso, now);
  if (!bracket) return null;
  return { bracket, checkedAt: now.toISOString() };
}
