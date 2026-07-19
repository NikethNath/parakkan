// Pairing logic for the Meter tab: which staff reading belongs to which
// official CRIS totalizer. Kept out of the page file so it can be unit-tested.

export type NozzleField = "n1Open" | "n1Close" | "n2Open" | "n2Close";

// A staff reading keeps the name of whoever wrote the sheet it came from, plus
// which entry/field holds it so a flagged value can be quick-fixed in place.
export type Reading = { v: number; by: string; entryId: number; field: NozzleField };

export type FieldWrite = { field: NozzleField; value: number };

/** A sheet nozzle whose reading for the displayed side is missing (0 = not
 *  recorded). `siblingValue` is the nozzle's other reading when the staff did
 *  fill that one in (the usual "couldn't fill the closing" case). */
export type MissingSlot = {
  by: string;
  entryId: number;
  sideField: NozzleField;
  siblingField: NozzleField;
  siblingValue?: number;
};

/** A proposed repair for an official-only cell: write these values into the
 *  sheet so its litres become right again. Shown as a "Fill ← CRIS" button. */
export type Fill = { by: string; entryId: number; writes: FieldWrite[] };

export type Cell = { reading?: Reading; cris?: number; fill?: Fill };

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

/**
 * Attach "Fill ← CRIS" proposals to official-only cells (cris but no staff
 * reading) from the sheets' missing nozzle slots.
 *
 * A slot whose sibling reading exists (staff filled the opening but not the
 * closing) is matched to its pump by proximity — the sibling is the same
 * pump's other boundary, so it sits within a shift's dispensing of the
 * official value. The fill then writes just the missing field.
 *
 * A fully blank slot (0/0) has no signal, so it takes the remaining cells in
 * order; the fill writes BOTH readings — the displayed side from CRIS, the
 * sibling from the counterpart shift's staff reading for that pump (the
 * midday totalizer, matched by proximity), falling back to the official value
 * itself (zero litres for that nozzle — the safe assumption for a pump that
 * sat unused).
 */
export function assignFills(
  cells: Cell[],
  missing: MissingSlot[],
  counterpartStaff: number[],
): void {
  const openCells = () =>
    cells.map((c, i) => i).filter((i) => cells[i].cris !== undefined && !cells[i].reading && !cells[i].fill);

  for (const slot of missing.filter((s) => s.siblingValue !== undefined)) {
    let best = -1;
    let bestD = MAX_PAIR_DIFF;
    for (const i of openCells()) {
      const d = Math.abs(slot.siblingValue! - cells[i].cris!);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      cells[best].fill = {
        by: slot.by,
        entryId: slot.entryId,
        writes: [{ field: slot.sideField, value: cells[best].cris! }],
      };
    }
  }

  for (const slot of missing.filter((s) => s.siblingValue === undefined)) {
    const idx = openCells()[0];
    if (idx === undefined) break;
    const cris = cells[idx].cris!;
    let sibling = cris; // zero litres unless the other shift recorded the midday
    let bestD = MAX_PAIR_DIFF;
    for (const v of counterpartStaff) {
      const d = Math.abs(v - cris);
      if (d < bestD) {
        bestD = d;
        sibling = v;
      }
    }
    cells[idx].fill = {
      by: slot.by,
      entryId: slot.entryId,
      writes: [
        { field: slot.sideField, value: cris },
        { field: slot.siblingField, value: sibling },
      ],
    };
  }
}
