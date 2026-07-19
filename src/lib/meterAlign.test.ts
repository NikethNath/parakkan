import { describe, expect, it } from "vitest";
import { alignSide, type Reading } from "./meterAlign";

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
