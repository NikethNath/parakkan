import { describe, it, expect } from "vitest";
import { compareCris, CRIS_TOLERANCE } from "./crisCompare";

describe("compareCris", () => {
  it("matches when staff and CRIS agree", () => {
    expect(compareCris({ cris: 1000, maintenance: 0, staff: 1000.1 })).toMatchObject({
      delta: 0.1,
      off: false,
      explained: false,
      suggestion: null,
    });
  });

  it("flags a repairman's unauthorised test and suggests the gap", () => {
    // 20 L pumped through a DU during repairs: CRIS calls it sold, the staff
    // sheet records it as a test.
    expect(compareCris({ cris: 1020, maintenance: 0, staff: 1000 })).toMatchObject({
      adjusted: 1020,
      delta: -20,
      off: true,
      suggestion: 20,
    });
  });

  it("reconciles once the maintenance test is recorded", () => {
    expect(compareCris({ cris: 1020, maintenance: 20, staff: 1000 })).toEqual({
      adjusted: 1000,
      delta: 0,
      off: false,
      explained: true,
      suggestion: null,
    });
  });

  it("still flags what the maintenance test doesn't account for", () => {
    const v = compareCris({ cris: 1020, maintenance: 15, staff: 1000 });
    expect(v.delta).toBe(-5);
    expect(v.off).toBe(true);
    // Something is already recorded, so no second guess is offered.
    expect(v.suggestion).toBeNull();
  });

  it("never suggests a maintenance test when staff are ahead of CRIS", () => {
    const v = compareCris({ cris: 1000, maintenance: 0, staff: 1020 });
    expect(v.off).toBe(true);
    expect(v.suggestion).toBeNull();
  });

  it("treats a gap inside the tolerance as matching", () => {
    const v = compareCris({ cris: 1000 + CRIS_TOLERANCE, maintenance: 0, staff: 1000 });
    expect(v.off).toBe(false);
    expect(v.suggestion).toBeNull();
  });

  it("has nothing to say about a day CRIS hasn't covered", () => {
    expect(compareCris({ cris: null, maintenance: 0, staff: 500 })).toEqual({
      adjusted: null,
      delta: null,
      off: false,
      explained: false,
      suggestion: null,
    });
  });
});
