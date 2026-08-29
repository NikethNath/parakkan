import type { Prisma } from "@prisma/client";
import { toNum, isoDate } from "@/lib/format";

/**
 * Resolves the money-received side of reconciliation for each day.
 *
 * A day's figures **add up**, because in 2026 a single day's collections can
 * arrive through more than one provider. 25 Aug 2026 is the clearest case: UPI
 * ran through PhonePe until the switch mid-day and through Paytm afterwards, so
 * that day's GPay is PhonePe's ₹71,082.92 *plus* whatever the Paytm report says.
 *
 * The one exception is `PAYTM_BANK` — a Paytm settlement credit read off the
 * bank statement. Once the Paytm report covers that day it describes the same
 * money in more detail (and split by channel, which the bank credit is not), so
 * the bank's version is dropped rather than added. Without that, importing an
 * August report would count 7–24 Aug card money twice: once from the Paytm NEFT
 * credits already imported, once from the report.
 *
 * Shared by the reconcile table and `buildSummary`, so the screen, the
 * accountant's summary and the Excel export can never disagree.
 */

export interface BankFigureRow {
  businessDate: Date;
  channel: string;
  amount: unknown; // Prisma Decimal
  source: string;
}

export interface BankFigure {
  amount: number;
  /** True when part of this came from the Paytm report rather than a statement. */
  fromReport: boolean;
}

/** Rows Prisma must return for this to work. */
export const bankFigureSelect = {
  businessDate: true,
  channel: true,
  amount: true,
  source: true,
} as const;

export const PAYTM_REPORT = "PAYTM_REPORT";
export const PAYTM_BANK = "PAYTM_BANK";

const key = (date: string, channel: string) => `${date}|${channel}`;

/**
 * Returns a map of `YYYY-MM-DD|CHANNEL` → figure. A day/channel with no rows at
 * all is absent from the map, which callers must render as "not recorded"
 * rather than ₹0 — a day nobody has imported yet would otherwise read as a
 * total shortfall.
 */
export function sumBankFigures(rows: BankFigureRow[]): Map<string, BankFigure> {
  // Which days the Paytm report covers; on those, the bank's own Paytm credit
  // is the same money and must not be added on top.
  const reportedDays = new Set(
    rows.filter((r) => r.source === PAYTM_REPORT).map((r) => isoDate(r.businessDate)),
  );

  const out = new Map<string, BankFigure>();
  for (const r of rows) {
    const date = isoDate(r.businessDate);
    if (r.source === PAYTM_BANK && reportedDays.has(date)) continue;

    const k = key(date, r.channel);
    const seen = out.get(k) ?? { amount: 0, fromReport: false };
    seen.amount += toNum(r.amount);
    seen.fromReport ||= r.source === PAYTM_REPORT;
    out.set(k, seen);
  }
  return out;
}

export const bankFigureAt = (
  figures: Map<string, BankFigure>,
  date: string,
  channel: string,
): BankFigure | null => figures.get(key(date, channel)) ?? null;

export const CSV_NARRATION = "Imported from the Paytm Business report";

export interface ReportDayFigures {
  businessDate: string; // YYYY-MM-DD
  gpay: number;
  pos: number;
}

/**
 * Writes the GPay/POS figures the Paytm report gives for whole days, replacing
 * whatever a previous import wrote for those same days.
 *
 * Only `PAYTM_REPORT` rows are replaced. Rows parsed from a bank statement are
 * left alone — a PhonePe credit on a changeover day still counts, and a Paytm
 * bank credit is skipped on read rather than deleted, so re-importing a
 * statement can never double anything up.
 */
export async function saveReportFigures(
  tx: Prisma.TransactionClient,
  days: ReportDayFigures[],
  userId: number,
): Promise<void> {
  if (days.length === 0) return;
  const dates = days.map((d) => new Date(`${d.businessDate}T00:00:00.000Z`));

  await tx.bankTxn.deleteMany({
    where: { businessDate: { in: dates }, source: PAYTM_REPORT },
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
        source: PAYTM_REPORT,
        narration: CSV_NARRATION,
      }));
    }),
  });
}
