import { prisma } from "@/lib/db";
import { toNum, isoDate, dayBoundsUTC } from "@/lib/format";
import { bankFigureSelect, preferTyped } from "@/lib/bankFigures";

/**
 * The per-day summary the accountant works from, shared by the on-screen table
 * (`SummaryReport`) and the Excel export so the two can never disagree.
 *
 * Every field on `SummaryRow` is additive — days sum into a period total by
 * adding field by field. Anything that must NOT be summed (a rate) is derived
 * from those sums instead, which also makes the total row a correctly
 * value-weighted average when the pump rate changed inside the period.
 */

export interface SummaryRow {
  msSaleable: number;
  hsdSaleable: number;
  msValue: number; // ₹ of MS dispensed (saleable litres × rate)
  hsdValue: number;
  msTest: number;
  hsdTest: number;
  credit: number;
  expense: number;
  salary: number;
  oil: number;
  cash: number;
  gpayStmt: number;
  gpayStaff: number;
  posStmt: number;
  posStaff: number;
}

export const SUMMARY_KEYS = [
  "msSaleable",
  "hsdSaleable",
  "msValue",
  "hsdValue",
  "msTest",
  "hsdTest",
  "credit",
  "expense",
  "salary",
  "oil",
  "cash",
  "gpayStmt",
  "gpayStaff",
  "posStmt",
  "posStaff",
] as const;

export type SummaryKind = "L" | "money" | "rate";

export interface SummaryCol {
  label: string;
  kind: SummaryKind;
  /** Pulls the number out of a row — derived for rates, a plain field otherwise. */
  value: (r: SummaryRow) => number;
}

/** ₹/L actually realised: value ÷ litres, so a mid-period rate change averages
 *  by value rather than by day. Zero litres has no rate to show. */
const rate = (value: number, litres: number) => (litres > 0 ? value / litres : 0);

export const SUMMARY_COLS: SummaryCol[] = [
  { label: "MS saleable (L)", kind: "L", value: (r) => r.msSaleable },
  { label: "MS rate (₹/L)", kind: "rate", value: (r) => rate(r.msValue, r.msSaleable) },
  { label: "MS value", kind: "money", value: (r) => r.msValue },
  { label: "HSD saleable (L)", kind: "L", value: (r) => r.hsdSaleable },
  { label: "HSD rate (₹/L)", kind: "rate", value: (r) => rate(r.hsdValue, r.hsdSaleable) },
  { label: "HSD value", kind: "money", value: (r) => r.hsdValue },
  { label: "Fuel value", kind: "money", value: (r) => r.msValue + r.hsdValue },
  { label: "MS test (L)", kind: "L", value: (r) => r.msTest },
  { label: "HSD test (L)", kind: "L", value: (r) => r.hsdTest },
  { label: "Credit", kind: "money", value: (r) => r.credit },
  { label: "Expense", kind: "money", value: (r) => r.expense },
  { label: "Salary", kind: "money", value: (r) => r.salary },
  { label: "Oil", kind: "money", value: (r) => r.oil },
  { label: "Cash", kind: "money", value: (r) => r.cash },
  { label: "GPay (received)", kind: "money", value: (r) => r.gpayStmt },
  { label: "GPay (staff)", kind: "money", value: (r) => r.gpayStaff },
  { label: "POS (received)", kind: "money", value: (r) => r.posStmt },
  { label: "POS (staff)", kind: "money", value: (r) => r.posStaff },
];

export const emptySummaryRow = (): SummaryRow =>
  Object.fromEntries(SUMMARY_KEYS.map((k) => [k, 0])) as unknown as SummaryRow;

export interface Summary {
  days: { date: string; row: SummaryRow }[];
  totals: SummaryRow;
}

/** `from`/`to` are inclusive YYYY-MM-DD business dates. */
export async function buildSummary(from: string, to: string): Promise<Summary> {
  const start = new Date(`${from}T00:00:00.000Z`);
  const endExclusive = dayBoundsUTC(to).end;

  const [entries, txns] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { businessDate: { gte: start, lt: endExclusive } },
      select: {
        businessDate: true,
        product: true,
        netSalableLitres: true,
        fuelExpected: true,
        testLitres: true,
        creditTotal: true,
        expensesTotal: true,
        salaryTotal: true,
        oilTotal: true,
        cashTotal: true,
        gpay: true,
        pos: true,
      },
    }),
    prisma.bankTxn.findMany({
      where: { businessDate: { gte: start, lt: endExclusive } },
      select: bankFigureSelect,
    }),
  ]);

  const map = new Map<string, SummaryRow>();
  const dayOf = (d: Date) => {
    const k = isoDate(d);
    const r = map.get(k) ?? emptySummaryRow();
    map.set(k, r);
    return r;
  };

  for (const e of entries) {
    const r = dayOf(e.businessDate);
    const net = toNum(e.netSalableLitres);
    const test = toNum(e.testLitres);
    // fuelExpected is what the till owes for fuel: saleable litres × that
    // sheet's rate. Summing it per product gives the value dispensed, and
    // keeps a mid-day rate change honest.
    const value = toNum(e.fuelExpected);
    if (e.product === "MS") {
      r.msSaleable += net;
      r.msTest += test;
      r.msValue += value;
    } else {
      r.hsdSaleable += net;
      r.hsdTest += test;
      r.hsdValue += value;
    }
    r.credit += toNum(e.creditTotal);
    r.expense += toNum(e.expensesTotal);
    r.salary += toNum(e.salaryTotal);
    r.oil += toNum(e.oilTotal);
    r.cash += toNum(e.cashTotal);
    r.gpayStaff += toNum(e.gpay);
    r.posStaff += toNum(e.pos);
  }
  // A figure typed in from the Paytm app supersedes the parsed rows for that
  // day and channel — the same rule the reconcile table uses, so this report
  // and that screen can never disagree.
  for (const [k, figure] of preferTyped(txns)) {
    const [date, channel] = k.split("|");
    const r = dayOf(new Date(`${date}T00:00:00.000Z`));
    if (channel === "GPAY") r.gpayStmt += figure.amount;
    else if (channel === "POS") r.posStmt += figure.amount;
  }

  const days = [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1)) // oldest first
    .map(([date, row]) => ({ date, row }));

  const totals = emptySummaryRow();
  for (const { row } of days) for (const k of SUMMARY_KEYS) totals[k] += row[k];

  return { days, totals };
}
