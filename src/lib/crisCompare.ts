/**
 * CRIS vs staff net sales for one day and product, allowing for maintenance
 * tests CRIS doesn't know about.
 *
 * CRIS's "net totalizer sales" is the dispensers' total minus only the tests
 * authorised from the automation computer. When a repairman checks a
 * dispenser by pumping fuel through it directly, CRIS books those litres as
 * sold. The staff sheet, which records them as test litres, then shows less
 * than CRIS — correctly. Subtracting the recorded maintenance test from CRIS
 * gives what was really sold, and that is what the staff figure is held to.
 */

/** Litres either side of zero that still count as matching. */
export const CRIS_TOLERANCE = 0.15;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CrisCompareRow {
  date: string;
  /** CRIS net totalizer sales, or null when CRIS hasn't been fetched for the day. */
  cris: number | null;
  /** Unauthorised test litres recorded against the day (0 when none). */
  maintenance: number;
  maintenanceNote: string | null;
  staff: number;
}

export interface CrisVerdict {
  /** CRIS minus the maintenance test — what was really sold, per CRIS. */
  adjusted: number | null;
  /** staff − adjusted. */
  delta: number | null;
  off: boolean;
  /** Only matches because of the recorded maintenance test. */
  explained: boolean;
  /**
   * When CRIS is ahead of the staff by more than the tolerance and nothing is
   * recorded yet, the gap — offered as a starting figure, since an unrecorded
   * maintenance test is exactly what that shape of mismatch looks like.
   */
  suggestion: number | null;
}

export function compareCris(r: Pick<CrisCompareRow, "cris" | "maintenance" | "staff">): CrisVerdict {
  if (r.cris === null) {
    return { adjusted: null, delta: null, off: false, explained: false, suggestion: null };
  }
  const adjusted = round2(r.cris - r.maintenance);
  const delta = round2(r.staff - adjusted);
  const off = Math.abs(delta) > CRIS_TOLERANCE;
  const rawGap = round2(r.cris - r.staff);
  return {
    adjusted,
    delta,
    off,
    explained: !off && r.maintenance > 0,
    // Staff ahead of CRIS can't be a maintenance test — that would widen the
    // gap — so only a CRIS surplus is suggested.
    suggestion: r.maintenance === 0 && rawGap > CRIS_TOLERANCE ? rawGap : null,
  };
}
