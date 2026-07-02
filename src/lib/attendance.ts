import type { Prisma, Shift } from "@prisma/client";

/**
 * Recompute a person's AUTO attendance for one (date, shift) from the current
 * sheets and add or remove it to match. A person is "present" for a shift if any
 * sheet that day/shift lists them as the employee OR the partner.
 *
 * - Present and not yet marked → create an AUTO PRESENT row.
 * - Present and already marked  → leave it (an existing MANUAL mark is untouched).
 * - Not present                 → delete only an AUTO row (never a MANUAL one).
 *
 * Call it inside the same transaction as the entry create/update/delete, after
 * that write, so the counts reflect the new truth. Run it for every (person,
 * date, shift) the change could have affected (old + new employee/partner).
 */
export async function reconcileAutoAttendance(
  tx: Prisma.TransactionClient,
  employeeId: number,
  date: Date,
  shift: Shift,
): Promise<void> {
  const covered = await tx.dailyEntry.count({
    where: {
      businessDate: date,
      shift,
      OR: [{ employeeId }, { partnerId: employeeId }],
    },
  });

  if (covered > 0) {
    await tx.attendance.upsert({
      where: { employeeId_date_shift: { employeeId, date, shift } },
      update: {}, // leave any existing row (incl. a MANUAL mark) as-is
      create: { employeeId, date, shift, status: "PRESENT", source: "AUTO" },
    });
  } else {
    await tx.attendance.deleteMany({
      where: { employeeId, date, shift, source: "AUTO" },
    });
  }
}

/** One entry's people/shift, as seen at a point in time. */
export type EntrySnapshot = {
  employeeId: number;
  partnerId: number | null;
  date: Date;
  shift: Shift;
};

/**
 * Reconcile attendance for both people on a single entry snapshot. Use after a
 * create (pass the new values) or a delete (pass the removed entry's values).
 * Because it recomputes from the surviving sheets, a delete only clears a
 * person's AUTO mark when no other sheet still covers them.
 */
export async function syncAttendanceForEntry(
  tx: Prisma.TransactionClient,
  s: EntrySnapshot,
): Promise<void> {
  await reconcileAutoAttendance(tx, s.employeeId, s.date, s.shift);
  if (s.partnerId != null) {
    await reconcileAutoAttendance(tx, s.partnerId, s.date, s.shift);
  }
}

/**
 * Reconcile every (person, date, shift) an edit could have touched — the
 * employee and partner, before and after — so a moved date/shift or a
 * swapped/removed partner all self-correct without leaving stray marks.
 */
export async function syncAttendanceForUpdate(
  tx: Prisma.TransactionClient,
  before: EntrySnapshot,
  after: EntrySnapshot,
): Promise<void> {
  const tuples: { employeeId: number; date: Date; shift: Shift }[] = [
    { employeeId: after.employeeId, date: after.date, shift: after.shift },
    { employeeId: before.employeeId, date: before.date, shift: before.shift },
  ];
  if (after.partnerId != null) {
    tuples.push({ employeeId: after.partnerId, date: after.date, shift: after.shift });
  }
  if (before.partnerId != null) {
    // Old partner on the old slot (cleanup if moved) and on the new slot
    // (cleanup if they were dropped/swapped but the date stayed the same).
    tuples.push({ employeeId: before.partnerId, date: before.date, shift: before.shift });
    tuples.push({ employeeId: before.partnerId, date: after.date, shift: after.shift });
  }

  const seen = new Set<string>();
  for (const t of tuples) {
    const key = `${t.employeeId}|${t.date.toISOString().slice(0, 10)}|${t.shift}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await reconcileAutoAttendance(tx, t.employeeId, t.date, t.shift);
  }
}
