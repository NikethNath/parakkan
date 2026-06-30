import { prisma } from "@/lib/db";
import { inr, toNum, isoDate, istToday, dayBoundsUTC, dayLabel } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import AutoSubmitDate from "@/components/AutoSubmitDate";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");
const L = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Row = {
  msSaleable: number;
  hsdSaleable: number;
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
};

const KEYS = [
  "msSaleable",
  "hsdSaleable",
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

const COLS: { key: keyof Row; label: string; kind: "L" | "money" }[] = [
  { key: "msSaleable", label: "MS saleable (L)", kind: "L" },
  { key: "hsdSaleable", label: "HSD saleable (L)", kind: "L" },
  { key: "msTest", label: "MS test (L)", kind: "L" },
  { key: "hsdTest", label: "HSD test (L)", kind: "L" },
  { key: "credit", label: "Credit", kind: "money" },
  { key: "expense", label: "Expense", kind: "money" },
  { key: "salary", label: "Salary", kind: "money" },
  { key: "oil", label: "Oil", kind: "money" },
  { key: "cash", label: "Cash", kind: "money" },
  { key: "gpayStmt", label: "GPay (stmt)", kind: "money" },
  { key: "gpayStaff", label: "GPay (staff)", kind: "money" },
  { key: "posStmt", label: "POS (stmt)", kind: "money" },
  { key: "posStaff", label: "POS (staff)", kind: "money" },
];

const emptyRow = (): Row =>
  Object.fromEntries(KEYS.map((k) => [k, 0])) as unknown as Row;

const fmt = (n: number, kind: "L" | "money") => (kind === "L" ? L(n) : inr(n));

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();
  const hasRange = isDate(sp.from) && isDate(sp.to);
  const fromRaw = isDate(sp.from) ? sp.from! : "";
  const toRaw = isDate(sp.to) ? sp.to! : "";
  const lo = !hasRange ? "" : fromRaw <= toRaw ? fromRaw : toRaw;
  const hi = !hasRange ? "" : fromRaw <= toRaw ? toRaw : fromRaw;

  let dayRows: { date: string; row: Row }[] = [];
  const totals = emptyRow();

  if (hasRange) {
    const start = new Date(lo + "T00:00:00.000Z");
    const endExclusive = dayBoundsUTC(hi).end;

    const [entries, txns] = await Promise.all([
      prisma.dailyEntry.findMany({
        where: { businessDate: { gte: start, lt: endExclusive } },
        select: {
          businessDate: true,
          product: true,
          netSalableLitres: true,
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
        select: { businessDate: true, channel: true, amount: true },
      }),
    ]);

    const map = new Map<string, Row>();
    const dayOf = (d: Date) => {
      const k = isoDate(d);
      const r = map.get(k) ?? emptyRow();
      map.set(k, r);
      return r;
    };

    for (const e of entries) {
      const r = dayOf(e.businessDate);
      const net = toNum(e.netSalableLitres);
      const test = toNum(e.testLitres);
      if (e.product === "MS") {
        r.msSaleable += net;
        r.msTest += test;
      } else {
        r.hsdSaleable += net;
        r.hsdTest += test;
      }
      r.credit += toNum(e.creditTotal);
      r.expense += toNum(e.expensesTotal);
      r.salary += toNum(e.salaryTotal);
      r.oil += toNum(e.oilTotal);
      r.cash += toNum(e.cashTotal);
      r.gpayStaff += toNum(e.gpay);
      r.posStaff += toNum(e.pos);
    }
    for (const t of txns) {
      const r = dayOf(t.businessDate);
      const amt = toNum(t.amount);
      if (t.channel === "GPAY") r.gpayStmt += amt;
      else if (t.channel === "POS") r.posStmt += amt;
    }

    dayRows = [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1)) // oldest first
      .map(([date, row]) => ({ date, row }));

    for (const { row } of dayRows) for (const k of KEYS) totals[k] += row[k];
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-3 rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border print:hidden">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">From</span>
            <AutoSubmitDate
              type="date"
              name="from"
              defaultValue={fromRaw}
              max={today}
              className="rounded-lg border border-border px-3 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">To</span>
            <AutoSubmitDate
              type="date"
              name="to"
              defaultValue={toRaw}
              max={today}
              className="rounded-lg border border-border px-3 py-1.5"
            />
          </label>
        </form>
        {hasRange && <PrintButton />}
      </div>

      {!hasRange ? (
        <p className="px-1 text-sm text-muted">
          Pick a start and end date to see a per-day summary.
        </p>
      ) : (
        <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Daily summary · {dayLabel(lo)} – {dayLabel(hi)}
            </h2>
            <p className="text-xs text-muted">
              {dayRows.length} day{dayRows.length === 1 ? "" : "s"} with activity
            </p>
          </div>

          {dayRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">No data in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    {COLS.map((c) => (
                      <th key={c.key} className="px-2 py-1.5 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map(({ date, row }) => (
                    <tr key={date} className="border-t border-border">
                      <td className="px-2 py-1.5 font-medium text-foreground">{dayLabel(date)}</td>
                      {COLS.map((c) => (
                        <td key={c.key} className="px-2 py-1.5 text-right tabular-nums">
                          {fmt(row[c.key], c.kind)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-2 py-2">Total</td>
                    {COLS.map((c) => (
                      <td key={c.key} className="px-2 py-2 text-right tabular-nums">
                        {fmt(totals[c.key], c.kind)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
