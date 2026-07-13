import {
  AGE_BRACKET,
  AGE_GATE_METADATA_KEY,
  MIN_AGE,
  bracketForAge,
  bracketForDob,
  buildAgeGateMetadata,
  calculateAge,
  readAgeGate,
} from "@/lib/ageGate";

// Fixed "now" so age math is deterministic regardless of when tests run.
const NOW = new Date(2026, 6, 13); // 2026-07-13 (month is 0-indexed)

describe("calculateAge", () => {
  it("computes a straightforward age", () => {
    expect(calculateAge("2000-01-01", NOW)).toBe(26);
  });

  it("subtracts a year when the birthday hasn't happened yet this year", () => {
    // Birthday is 2026-12-25, which is after 2026-07-13
    expect(calculateAge("2010-12-25", NOW)).toBe(15);
  });

  it("counts the birthday itself as the new age (>= boundary)", () => {
    expect(calculateAge("2013-07-13", NOW)).toBe(13);
  });

  it("returns null for malformed input", () => {
    expect(calculateAge("not-a-date", NOW)).toBeNull();
    expect(calculateAge("", NOW)).toBeNull();
    expect(calculateAge(undefined, NOW)).toBeNull();
    expect(calculateAge(20130713, NOW)).toBeNull();
  });

  it("rejects impossible calendar dates rather than rolling them over", () => {
    // Feb 31 would roll to early March if constructed naively
    expect(calculateAge("2011-02-31", NOW)).toBeNull();
  });

  it("returns null for a future date of birth", () => {
    expect(calculateAge("2030-01-01", NOW)).toBeNull();
  });
});

describe("bracketForAge / bracketForDob", () => {
  it("brackets under-13 as UNDER_13", () => {
    expect(bracketForAge(12)).toBe(AGE_BRACKET.UNDER_13);
    expect(bracketForDob("2014-01-01", NOW)).toBe(AGE_BRACKET.UNDER_13);
  });

  it("brackets exactly 13 as a minor (eligible)", () => {
    expect(bracketForAge(MIN_AGE)).toBe(AGE_BRACKET.MINOR_13_17);
    expect(bracketForDob("2013-07-13", NOW)).toBe(AGE_BRACKET.MINOR_13_17);
  });

  it("brackets 13-17 as MINOR_13_17", () => {
    expect(bracketForAge(17)).toBe(AGE_BRACKET.MINOR_13_17);
  });

  it("brackets 18+ as ADULT_18_PLUS", () => {
    expect(bracketForAge(18)).toBe(AGE_BRACKET.ADULT_18_PLUS);
    expect(bracketForDob("2000-01-01", NOW)).toBe(AGE_BRACKET.ADULT_18_PLUS);
  });

  it("returns null for invalid ages", () => {
    expect(bracketForAge(null)).toBeNull();
    expect(bracketForAge(NaN)).toBeNull();
    expect(bracketForAge(-1)).toBeNull();
  });
});

describe("buildAgeGateMetadata", () => {
  it("returns bracket + timestamp and never the raw DOB", () => {
    const meta = buildAgeGateMetadata("2000-01-01", NOW);
    expect(meta).toEqual({
      bracket: AGE_BRACKET.ADULT_18_PLUS,
      checkedAt: NOW.toISOString(),
    });
    // Data minimization: no dob field of any kind
    expect(JSON.stringify(meta)).not.toContain("2000-01-01");
    expect(meta).not.toHaveProperty("dob");
    expect(meta).not.toHaveProperty("dateOfBirth");
  });

  it("returns null for an invalid DOB so callers can show an error", () => {
    expect(buildAgeGateMetadata("2011-02-31", NOW)).toBeNull();
    expect(buildAgeGateMetadata("", NOW)).toBeNull();
  });
});

describe("readAgeGate", () => {
  it("treats missing/empty metadata as not checked", () => {
    expect(readAgeGate(undefined).checked).toBe(false);
    expect(readAgeGate({}).checked).toBe(false);
    expect(readAgeGate({ [AGE_GATE_METADATA_KEY]: {} }).checked).toBe(false);
  });

  it("reports a blocked (under-13) user", () => {
    const status = readAgeGate({
      [AGE_GATE_METADATA_KEY]: { bracket: AGE_BRACKET.UNDER_13, checkedAt: "x" },
    });
    expect(status).toMatchObject({
      checked: true,
      blocked: true,
      eligible: false,
      isMinor: false,
    });
  });

  it("reports an eligible minor and flags isMinor", () => {
    const status = readAgeGate({
      [AGE_GATE_METADATA_KEY]: { bracket: AGE_BRACKET.MINOR_13_17, checkedAt: "x" },
    });
    expect(status).toMatchObject({ checked: true, eligible: true, blocked: false, isMinor: true });
  });

  it("reports an eligible adult", () => {
    const status = readAgeGate({
      [AGE_GATE_METADATA_KEY]: { bracket: AGE_BRACKET.ADULT_18_PLUS, checkedAt: "x" },
    });
    expect(status).toMatchObject({ checked: true, eligible: true, blocked: false, isMinor: false });
  });

  it("ignores an unrecognized bracket value", () => {
    expect(readAgeGate({ [AGE_GATE_METADATA_KEY]: { bracket: "bogus" } }).checked).toBe(false);
  });
});
