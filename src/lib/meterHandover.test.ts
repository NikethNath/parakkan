import { describe, it, expect } from "vitest";
import {
  blameHandover,
  handoverRows,
  pairHandover,
  HANDOVER_TOLERANCE,
  type HandoverSide,
} from "./meterHandover";

const side = (o: Partial<HandoverSide> & { value: number }): HandoverSide => ({
  entryId: 1,
  field: "n1Close",
  by: "Rajesh",
  rate: 100,
  shortExcess: 0,
  // Far enough away that a fix is never blocked unless a test says so.
  bound: o.value - 10_000,
  ...o,
});

const morning = (value: number, rest: Partial<HandoverSide> = {}) =>
  side({ value, field: "n1Close", bound: value - 500, ...rest });
const evening = (value: number, rest: Partial<HandoverSide> = {}) =>
  side({ value, field: "n1Open", entryId: 2, by: "Suresh", bound: value + 500, ...rest });

describe("pairHandover", () => {
  it("pairs each nozzle with its own counterpart, not by position", () => {
    // Submission order is unreliable and the two pumps' totals are far apart.
    const m = [morning(55_000), morning(12_000)];
    const e = [evening(12_000), evening(55_000)];
    const pairs = pairHandover(m, e);
    expect(pairs).toHaveLength(2);
    for (const p of pairs) expect(p.morning.value).toBe(p.evening.value);
  });

  it("takes the closest match first so a near-tie cannot steal a nozzle", () => {
    const m = [morning(10_000), morning(10_040)];
    const e = [evening(10_041), evening(10_002)];
    const pairs = pairHandover(m, e);
    const got = pairs.map((p) => [p.morning.value, p.evening.value]).sort();
    expect(got).toEqual([
      [10_000, 10_002],
      [10_040, 10_041],
    ]);
  });

  it("leaves a nozzle unpaired when nothing is within range", () => {
    // A pump that only one shift recorded at all — different pumps' running
    // totals are nowhere near each other.
    expect(pairHandover([morning(10_000)], [evening(950_000)])).toHaveLength(0);
  });

  it("pairs only as many as both sides have", () => {
    expect(pairHandover([morning(10_000), morning(10_010)], [evening(10_005)])).toHaveLength(1);
  });
});

describe("blameHandover", () => {
  // A 5 L gap at ₹100/L moves the mis-typed sheet's short/excess by ₹500.
  it("blames the shift whose short/excess matches the gap", () => {
    const r = blameHandover(
      5,
      5,
      { rate: 100, shortExcess: -500 }, // morning short by exactly the gap's value
      { rate: 100, shortExcess: 0 }, // evening balanced
    );
    expect(r.blame).toBe("MORNING");
    expect(r.expectedMorning).toBe(-500);
  });

  it("blames the evening when that is the shift carrying the discrepancy", () => {
    const r = blameHandover(
      5,
      5,
      { rate: 100, shortExcess: 0 },
      { rate: 100, shortExcess: -500 },
    );
    expect(r.blame).toBe("EVENING");
  });

  it("reads the other sign too — an excess when the gap runs the other way", () => {
    // Evening opened higher than the morning closed: the sheets undercount, so
    // the mis-typed shift shows an excess.
    const r = blameHandover(
      -5,
      -5,
      { rate: 100, shortExcess: 500 },
      { rate: 100, shortExcess: 0 },
    );
    expect(r.expectedMorning).toBe(500);
    expect(r.blame).toBe("MORNING");
  });

  it("says so when the cash cannot tell them apart", () => {
    // Both balanced: nothing in the money points at either sheet.
    expect(
      blameHandover(5, 5, { rate: 100, shortExcess: 0 }, { rate: 100, shortExcess: 0 }).blame,
    ).toBe("UNCLEAR");
    // Both carrying the same discrepancy is equally mute.
    expect(
      blameHandover(5, 5, { rate: 100, shortExcess: -500 }, { rate: 100, shortExcess: -500 })
        .blame,
    ).toBe("UNCLEAR");
  });

  it("uses each sheet's own rate, so a midday price change still adds up", () => {
    const r = blameHandover(
      10,
      10,
      { rate: 100, shortExcess: 0 },
      { rate: 106.5, shortExcess: -1065 },
    );
    expect(r.expectedMorning).toBe(-1000);
    expect(r.expectedEvening).toBe(-1065);
    expect(r.blame).toBe("EVENING");
  });
});

describe("handoverRows", () => {
  it("reports nothing when the handover matches", () => {
    expect(handoverRows([morning(12_345.67)], [evening(12_345.67)])).toEqual([]);
  });

  it("ignores a difference below the tolerance", () => {
    const rows = handoverRows([morning(12_345.67)], [evening(12_345.67 - HANDOVER_TOLERANCE / 2)]);
    expect(rows).toEqual([]);
  });

  it("flags a mismatch and proposes both repairs", () => {
    const rows = handoverRows(
      [morning(12_350, { entryId: 7, shortExcess: -500 })],
      [evening(12_345, { entryId: 8 })],
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.gap).toBe(5);
    expect(r.blame).toBe("MORNING");
    // "Use the morning's figure" writes it into the EVENING sheet's opening.
    expect(r.useMorning).toMatchObject({ entryId: 8, field: "n1Open", value: 12_350 });
    // "Use the evening's figure" writes it into the MORNING sheet's closing.
    expect(r.useEvening).toMatchObject({ entryId: 7, field: "n1Close", value: 12_345 });
    expect(r.useMorning.blocked).toBeUndefined();
    expect(r.useEvening.blocked).toBeUndefined();
  });

  it("edits the field a swapped reading actually came from", () => {
    // A legacy sheet whose closing is stored in n1Open.
    const rows = handoverRows(
      [morning(12_350, { field: "n1Open" })],
      [evening(12_345, { field: "n2Close" })],
    );
    expect(rows[0].useMorning.field).toBe("n2Close");
    expect(rows[0].useEvening.field).toBe("n1Open");
  });

  it("refuses a repair that would invert the target sheet's own pair", () => {
    // The evening sheet closed at 12,346 — writing the morning's 12,350 in as
    // its opening would make opening > closing, which the calc would swap into
    // a whole-totalizer litre figure.
    const rows = handoverRows(
      [morning(12_350, { bound: 12_000 })],
      [evening(12_345, { bound: 12_346 })],
    );
    expect(rows[0].useMorning.blocked).toMatch(/past this sheet's own closing/);
    expect(rows[0].useEvening.blocked).toBeUndefined();
  });

  it("judges a sheet with two bad nozzles on both gaps together", () => {
    // One morning sheet, both nozzles typed 5 L high: its short is ₹1,000, not
    // ₹500, so blaming per nozzle would call this unclear.
    const rows = handoverRows(
      [
        morning(12_350, { entryId: 7, field: "n1Close", shortExcess: -1000 }),
        morning(48_350, { entryId: 7, field: "n2Close", shortExcess: -1000 }),
      ],
      [
        evening(12_345, { entryId: 8, field: "n1Open" }),
        evening(48_345, { entryId: 8, field: "n2Open" }),
      ],
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.blame).toBe("MORNING");
      expect(r.expectedMorning).toBe(-1000);
    }
  });

  it("keeps separate dispensing units apart", () => {
    const rows = handoverRows(
      [morning(12_350, { entryId: 7 }), morning(48_000, { entryId: 9 })],
      [evening(12_345, { entryId: 8 }), evening(48_000, { entryId: 10 })],
    );
    // Only the first DU disagrees.
    expect(rows).toHaveLength(1);
    expect(rows[0].morning.entryId).toBe(7);
  });
});
