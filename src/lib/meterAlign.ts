// Pairing logic for the Meter tab: which staff reading belongs to which
// official CRIS totalizer. Kept out of the page file so it can be unit-tested.

export type NozzleField = "n1Open" | "n1Close" | "n2Open" | "n2Close";

// A staff reading keeps the name of whoever wrote the sheet it came from, plus
// which entry/field holds it so a flagged value can be quick-fixed in place.
export type Reading = { v: number; by: string; entryId: number; field: NozzleField };

export type Cell = { reading?: Reading; cris?: number };

// A staff reading and its own pump's official totalizer differ by at most a
// misread digit; different pumps' running totals differ by far more. Only pair
// a staff value with an official one inside this window.
export const MAX_PAIR_DIFF = 10_000;

/** Lay one product's readings into the table columns. With CRIS data the
 *  columns are anchored to the official totalizers (sorted ascending) and each
 *  staff reading is paired with the NEAREST official value — position-based
 *  pairing broke as soon as a nozzle sat unused (maintenance): the staff list
 *  came up short and every later column compared against the wrong pump. An
 *  unused nozzle now shows an official-only column instead. Without CRIS data
 *  the staff readings simply fill left to right, as before.
 *
 *  Both `staff` and `cris` are expected sorted ascending. */
export function alignSide(
  staff: Reading[],
  cris: number[] | undefined,
  nCols: number,
): Cell[] {
  const cells: Cell[] = Array.from({ length: nCols }, () => ({}));
  const official = (cris ?? []).slice(0, nCols);
  official.forEach((v, i) => (cells[i].cris = v));
  if (official.length === 0) {
    staff.slice(0, nCols).forEach((r, i) => (cells[i].reading = r));
    return cells;
  }
  const taken = new Set<number>();
  const unpaired: Reading[] = [];
  for (const r of staff) {
    let best = -1;
    let bestD = MAX_PAIR_DIFF;
    for (let i = 0; i < official.length; i++) {
      if (taken.has(i)) continue;
      const d = Math.abs(r.v - official[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      taken.add(best);
      cells[best].reading = r;
    } else {
      unpaired.push(r);
    }
  }
  // A reading with no official counterpart (CRIS missed that pump) gets its own
  // empty column rather than sitting under some other pump's totalizer.
  for (const r of unpaired) {
    const empty = cells.findIndex((c) => !c.reading && c.cris === undefined);
    if (empty >= 0) cells[empty].reading = r;
  }
  return cells;
}
