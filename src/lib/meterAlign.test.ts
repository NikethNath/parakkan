import { describe, expect, it } from "vitest";
import { alignSide, assignFills, type MissingSlot, type Reading } from "./meterAlign";

const r = (v: number): Reading => ({ v, by: "Rajesh", entryId: 1, field: "n1Open" });
const vals = (cells: ReturnType<typeof alignSide>) => cells.map((c) => c.reading?.v);
const cris = (cells: ReturnType<typeof alignSide>) => cells.map((c) => c.cris);

// Realistic running totals: four MS pumps, well separated.
const P = [1238041.9, 1412880.1, 1590396.81, 1655772.45];

describe("alignSide", () => {
  it("pairs every reading with its own pump when all nozzles were used", () => {
    const staff = P.map(r);
    const cells = alignSide(staff, P, 4);
    expect(vals(cells)).toEqual(P);
    expect(cris(cells)).toEqual(P);
  });

  it("keeps a digit-level mismatch paired with the right pump (so it can flag)", () => {
    const staff = [r(P[0]), r(P[1]), r(P[2] + 0.05), r(P[3])];
    const cells = alignSide(staff, P, 4);
    expect(cells[2].reading?.v).toBe(P[2] + 0.05);
    expect(cells[2].cris).toBe(P[2]);
  });

  it("leaves official-only columns when a nozzle sat unused (the maintenance bug)", () => {
    // Only pumps at index 1 and 2 were written up; position-based pairing used
    // to compare them against pumps 0 and 1 and flag both as wrong.
    const staff = [r(P[1]), r(P[2])];
    const cells = alignSide(staff, P, 4);
    expect(vals(cells)).toEqual([undefined, P[1], P[2], undefined]);
    expect(cris(cells)).toEqual(P);
  });

  it("gives a reading its own empty column when CRIS is missing that pump", () => {
    // CRIS omitted pump 3 entirely; its staff reading must not sit under
    // another pump's totalizer (which would false-flag by hundreds of litres).
    const staff = [r(P[0]), r(P[3])];
    const cells = alignSide(staff, [P[0], P[1], P[2]], 4);
    expect(cells[0]).toEqual({ reading: staff[0], cris: P[0] });
    expect(cells[1]).toEqual({ cris: P[1] });
    expect(cells[2]).toEqual({ cris: P[2] });
    expect(cells[3]).toEqual({ reading: staff[1] });
  });

  it("falls back to left-to-right order without CRIS data", () => {
    const staff = [r(P[0]), r(P[1])];
    const cells = alignSide(staff, undefined, 4);
    expect(vals(cells)).toEqual([P[0], P[1], undefined, undefined]);
    expect(cris(cells)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("pairs within a day's dispensing but never across pumps", () => {
    // 1,800 L away is still the same pump (a whole day's sales); the nearest
    // OTHER pump is > 10,000 L away and must not be matched.
    const staff = [r(P[1] + 1800)];
    const cells = alignSide(staff, P, 4);
    expect(cells[1].reading?.v).toBe(P[1] + 1800);
    expect(cells[1].cris).toBe(P[1]);
  });
});

describe("assignFills", () => {
  const slot = (over: Partial<MissingSlot>): MissingSlot => ({
    by: "Rajesh",
    entryId: 7,
    sideField: "n1Close",
    siblingField: "n1Open",
    ...over,
  });

  it("half-filled pair: matches by the sibling reading and writes only the missing field", () => {
    // Staff wrote the evening opening (midday) for pump P[2] but not the close.
    const cells = alignSide([r(P[0]), r(P[3])], P, 4);
    assignFills(cells, [slot({ siblingValue: P[2] - 300 })], []);
    expect(cells[2].fill).toEqual({
      by: "Rajesh",
      entryId: 7,
      writes: [{ field: "n1Close", value: P[2] }],
    });
    expect(cells[1].fill).toBeUndefined();
  });

  it("blank pair: writes both fields, sibling from the counterpart shift's midday", () => {
    const midday = P[1] - 250; // morning close for the same pump
    const cells = alignSide([r(P[0]), r(P[2]), r(P[3])], P, 4);
    assignFills(cells, [slot({})], [midday, P[3] + 90000]);
    expect(cells[1].fill?.writes).toEqual([
      { field: "n1Close", value: P[1] },
      { field: "n1Open", value: midday },
    ]);
  });

  it("blank pair with no midday data falls back to the official value (zero litres)", () => {
    const cells = alignSide([r(P[0]), r(P[2]), r(P[3])], P, 4);
    assignFills(cells, [slot({})], []);
    expect(cells[1].fill?.writes).toEqual([
      { field: "n1Close", value: P[1] },
      { field: "n1Open", value: P[1] },
    ]);
  });

  it("never proposes a fill on a cell that already has a staff reading", () => {
    const cells = alignSide(P.map(r), P, 4);
    assignFills(cells, [slot({ siblingValue: P[2] - 100 }), slot({})], []);
    expect(cells.every((c) => c.fill === undefined)).toBe(true);
  });
});
