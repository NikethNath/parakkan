/**
 * The midday handover check: on one dispensing unit, the morning sheet's
 * closing reading and the evening sheet's opening reading are the *same dial at
 * the same moment*, read once with both attendants present. They must be equal.
 *
 * When they aren't, exactly one sheet was typed wrong, and the day's litres are
 * out by the difference — which quietly moves one shift's short/excess and the
 * day's fuel value. Nothing flagged this before: the Meter tab computed both
 * midday figures (`midFromMorning`, `midFromEvening`) but only used them to
 * backfill blank nozzles, never to compare.
 *
 * This module is pure so the pairing and the blame can be unit-tested; the
 * screen lives in src/app/admin/meter/page.tsx and the repair goes through the
 * existing audited endpoint, /api/entries/[id]/fix-reading.
 */

import type { NozzleField } from "@/lib/meterAlign";
import { MAX_PAIR_DIFF } from "@/lib/meterAlign";

/** Totalizers are stored to 2dp and read off one dial, so anything at or above
 *  this is a real disagreement rather than rounding. Matches the tolerance the
 *  Meter tab already uses against CRIS. */
export const HANDOVER_TOLERANCE = 0.05;

/** One side of a handover: a nozzle's midday reading as one sheet recorded it. */
export interface HandoverSide {
  entryId: number;
  /** Which stored field holds this value — a legacy swapped pair can surface
   *  its closing from `n1Open`, and the fix must edit the field it came from. */
  field: NozzleField;
  value: number;
  by: string;
  rate: number;
  shortExcess: number;
  /** The same nozzle's *other* reading on that sheet (the morning's opening, or
   *  the evening's closing). A value written past it would invert the pair, and
   *  `entryInputSchema` would silently swap them into whole-totalizer litres. */
  bound: number;
}

export interface HandoverFix {
  entryId: number;
  field: NozzleField;
  value: number;
  /** Set when this repair must not be offered, saying why. */
  blocked?: string;
}

export type Blame = "MORNING" | "EVENING" | "UNCLEAR";

export interface HandoverRow {
  morning: HandoverSide;
  evening: HandoverSide;
  /** morning closing − evening opening. Either sign is a typo here. */
  gap: number;
  /** How far each sheet's short/excess would be out if *that* sheet holds the
   *  wrong reading — more litres attributed means a bigger short. */
  expectedMorning: number;
  expectedEvening: number;
  blame: Blame;
  /** Write the morning's figure into the evening's opening. */
  useMorning: HandoverFix;
  /** Write the evening's figure into the morning's closing. */
  useEvening: HandoverFix;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pair each morning closing with the evening opening for the same nozzle.
 *
 * Paired by proximity, not by position: sheets arrive in no reliable order and
 * a nozzle can sit unused, which makes position-based pairing compare different
 * pumps' running totals. Different pumps differ by far more than a handover
 * typo, so the nearest value inside `MAX_PAIR_DIFF` is the same nozzle.
 */
export function pairHandover(
  morning: HandoverSide[],
  evening: HandoverSide[],
): { morning: HandoverSide; evening: HandoverSide }[] {
  const pairs: { morning: HandoverSide; evening: HandoverSide }[] = [];
  // Closest overall first, so one near-tie can't steal another nozzle's match.
  const candidates = morning
    .flatMap((m, mi) => evening.map((e, ei) => ({ mi, ei, d: Math.abs(m.value - e.value) })))
    .filter((c) => c.d < MAX_PAIR_DIFF)
    .sort((a, b) => a.d - b.d);

  const usedM = new Set<number>();
  const usedE = new Set<number>();
  for (const c of candidates) {
    if (usedM.has(c.mi) || usedE.has(c.ei)) continue;
    usedM.add(c.mi);
    usedE.add(c.ei);
    pairs.push({ morning: morning[c.mi], evening: evening[c.ei] });
  }
  return pairs;
}

/**
 * Which sheet most likely holds the wrong reading.
 *
 * Both candidates predict the *same* signed error on their own shift, so the
 * reading alone cannot decide it — the cash can. Each hypothesis is scored by
 * how much short/excess it leaves unexplained across the two sheets, and the
 * tidier story wins. A sheet that was genuinely short for its own reasons makes
 * this inconclusive, which is reported rather than guessed at.
 *
 * `gaps` are the sheet's *total* gap across however many of its nozzles
 * mismatch, because short/excess is per sheet, not per nozzle.
 */
export function blameHandover(
  morningGap: number,
  eveningGap: number,
  morning: Pick<HandoverSide, "rate" | "shortExcess">,
  evening: Pick<HandoverSide, "rate" | "shortExcess">,
): { blame: Blame; expectedMorning: number; expectedEvening: number } {
  // Attributing extra litres to a shift raises what its till owed, so its
  // short/excess moves down by gap × rate.
  const expectedMorning = round2(-morningGap * morning.rate);
  const expectedEvening = round2(-eveningGap * evening.rate);

  const residualMorning =
    Math.abs(morning.shortExcess - expectedMorning) + Math.abs(evening.shortExcess);
  const residualEvening =
    Math.abs(morning.shortExcess) + Math.abs(evening.shortExcess - expectedEvening);

  // Within a rupee of each other, neither story is better than the other.
  const margin = Math.abs(residualMorning - residualEvening);
  const blame: Blame =
    margin < 1 ? "UNCLEAR" : residualMorning < residualEvening ? "MORNING" : "EVENING";

  return { blame, expectedMorning, expectedEvening };
}

/**
 * Build the flagged handover rows for one product on one day.
 *
 * `morning` holds each nozzle's closing reading, `evening` each nozzle's
 * opening. Only mismatching pairs come back; a matching handover is not news.
 */
export function handoverRows(
  morning: HandoverSide[],
  evening: HandoverSide[],
): HandoverRow[] {
  const mismatched = pairHandover(morning, evening)
    .map((p) => ({ ...p, gap: round2(p.morning.value - p.evening.value) }))
    .filter((p) => Math.abs(p.gap) >= HANDOVER_TOLERANCE);

  // Short/excess belongs to a sheet, not a nozzle, so a sheet with two bad
  // nozzles has to be judged on both gaps together.
  const sumBy = (key: (p: (typeof mismatched)[number]) => number) => {
    const totals = new Map<number, number>();
    for (const p of mismatched) totals.set(key(p), (totals.get(key(p)) ?? 0) + p.gap);
    return totals;
  };
  const morningGaps = sumBy((p) => p.morning.entryId);
  const eveningGaps = sumBy((p) => p.evening.entryId);

  return mismatched.map((p) => {
    const { blame, expectedMorning, expectedEvening } = blameHandover(
      round2(morningGaps.get(p.morning.entryId) ?? p.gap),
      round2(eveningGaps.get(p.evening.entryId) ?? p.gap),
      p.morning,
      p.evening,
    );

    // A repair must never push a reading past its own pair's other end: the
    // input schema would swap them and bill the shift for the whole totalizer.
    const useMorning: HandoverFix = {
      entryId: p.evening.entryId,
      field: p.evening.field,
      value: p.morning.value,
      ...(p.morning.value > p.evening.bound
        ? {
            blocked: `${p.morning.value.toFixed(2)} is past this sheet's own closing (${p.evening.bound.toFixed(2)}) — edit the sheet instead.`,
          }
        : {}),
    };
    const useEvening: HandoverFix = {
      entryId: p.morning.entryId,
      field: p.morning.field,
      value: p.evening.value,
      ...(p.evening.value < p.morning.bound
        ? {
            blocked: `${p.evening.value.toFixed(2)} is below this sheet's own opening (${p.morning.bound.toFixed(2)}) — edit the sheet instead.`,
          }
        : {}),
    };

    return { ...p, blame, expectedMorning, expectedEvening, useMorning, useEvening };
  });
}
