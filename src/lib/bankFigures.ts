import type { Prisma } from "@prisma/client";
import { toNum, isoDate } from "@/lib/format";

/**
 * Resolves the bank-side GPay/POS figure for each day.
 *
 * Most figures are parsed out of a statement. Since 25 Aug 2026 Paytm settles
 * UPI and card in one credit that says nothing about the split, so those days
 * are typed in by hand from the Paytm app instead (`enteredById` set).
 *
 * A typed figure **supersedes** the parsed rows for the same day and channel
 * rather than adding to them. That matters on a changeover day: 25 Aug has a
 * real PhonePe credit of ₹71,082.92 covering only part of the day's UPI, and
 * the typed total covers all of it — summing both would count the PhonePe money
 * twice.
 *
 * Shared by the reconcile table and `buildSummary`, so the screen, the
 * accountant's summary and the Excel export can never disagree.
 */

export interface BankFigureRow {
  businessDate: Date;
  channel: string;
  amount: unknown; // Prisma Decimal
  enteredById: number | null;
}

export interface BankFigure {
  amount: number;
  /** True when this came from the Paytm app by hand rather than a statement. */
  typed: boolean;
}

/** Rows Prisma must return for this to work. */
export const bankFigureSelect = {
  businessDate: true,
  channel: true,
  amount: true,
  enteredById: true,
} as const;

const key = (date: string, channel: string) => `${date}|${channel}`;

/**
 * Returns a map of `YYYY-MM-DD|CHANNEL` → figure. A day/channel with no row at
 * all is absent from the map, which callers must render as "not recorded"
 * rather than ₹0 — every day since the Paytm switch has no parsed figure until
 * someone types it, and zero would read as a total shortfall.
 */
export function preferTyped(rows: BankFigureRow[]): Map<string, BankFigure> {
  const out = new Map<string, BankFigure>();
  for (const r of rows) {
    const k = key(isoDate(r.businessDate), r.channel);
    const amount = toNum(r.amount);
    const typed = r.enteredById !== null;
    const seen = out.get(k);

    if (!seen) {
      out.set(k, { amount, typed });
    } else if (seen.typed === typed) {
      seen.amount += amount; // several rows of the same kind still add up
    } else if (typed) {
      out.set(k, { amount, typed: true }); // the typed figure wins outright
    }
    // a parsed row arriving after a typed one is dropped
  }
  return out;
}

export const bankFigureAt = (
  figures: Map<string, BankFigure>,
  date: string,
  channel: string,
): BankFigure | null => figures.get(key(date, channel)) ?? null;

/** How a typed figure got there — shown nowhere, but it makes the row's origin
 *  obvious when reading the table directly. */
export const MANUAL_NARRATION = "Entered by hand from the Paytm Business app";
export const CSV_NARRATION = "Imported from the Paytm Business report";

export interface TypedDayFigures {
  businessDate: string; // YYYY-MM-DD
  gpay: number;
  pos: number;
}

/**
 * Writes the typed GPay/POS figures for whole days, replacing whatever was
 * typed for those days before. Parsed statement rows are never touched — they
 * are superseded on read by `preferTyped`, not deleted, so re-importing a
 * statement still works.
 *
 * Shared by the per-day dialog and the Paytm CSV import so the two can't drift.
 * Caller supplies a transaction, since the CSV writes a whole month at once.
 */
export async function saveTypedFigures(
  tx: Prisma.TransactionClient,
  days: TypedDayFigures[],
  userId: number,
  narration: string,
): Promise<void> {
  if (days.length === 0) return;
  const dates = days.map((d) => new Date(`${d.businessDate}T00:00:00.000Z`));

  await tx.bankTxn.deleteMany({
    where: { businessDate: { in: dates }, enteredById: { not: null } },
  });
  await tx.bankTxn.createMany({
    data: days.flatMap((d) => {
      const date = new Date(`${d.businessDate}T00:00:00.000Z`);
      return (
        [
          ["GPAY", d.gpay],
          ["POS", d.pos],
        ] as const
      ).map(([channel, amount]) => ({
        uploadId: null,
        enteredById: userId,
        txnDate: date,
        businessDate: date,
        amount,
        channel,
        narration,
      }));
    }),
  });
}
