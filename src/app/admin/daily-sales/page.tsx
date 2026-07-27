import { prisma } from "@/lib/db";
import { toNum, istToday, dayLabel } from "@/lib/format";
import AutoSubmitDate from "@/components/AutoSubmitDate";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import PrintButton from "@/components/PrintButton";

/**
 * DSR "Daily sales" — the digital version of the paper Daily Sales Register,
 * one month per product, pulled entirely from the cached CRIS Daily Sales
 * report. Paper conventions (user-confirmed):
 *   Total Stock      = Opening Stock + Receipt
 *   Sales by Dip(N)  = Total Stock(N) − Opening Stock(N+1)
 *                      (the newest day uses CRIS's closing stock provisionally
 *                       until the next day's report arrives)
 *   Variation        = Net Sales by Meter − Sales by Dip
 *   Cumulatives      restart on the 1st of the shown month.
 */

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

const L = (n: number | undefined) =>
  n === undefined
    ? "—"
    : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type DsrRow = {
  date: string;
  opening?: number;
  receipt?: number;
  total?: number;
  byMeter: number;
  test: number;
  netMeter: number;
  cumSales: number;
  byDip?: number;
  provisional: boolean; // byDip from same-day closing stock (no next-day report yet)
  variation?: number;
  cumVariation?: number;
};

export default async function DailySalesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; product?: string }>;
}) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : istToday().slice(0, 7);
  const product = sp.product === "HSD" ? "HSD" : "MS";
  const { start, end } = monthBounds(month);
  // Fetch one extra day: the 1st of the next month supplies the last day's
  // next-day opening stock.
  const endPlus = new Date(end.getTime() + 86400000);

  const days = await prisma.crisDaily.findMany({
    where: { product, businessDate: { gte: start, lt: endPlus } },
    orderBy: { businessDate: "asc" },
  });

  const inMonth = days.filter((d) => d.businessDate < end);
  const openingByTime = new Map(
    days
      .filter((d) => d.openingStock !== null)
      .map((d) => [d.businessDate.getTime(), toNum(d.openingStock)] as const),
  );
  const lastFetched = inMonth.reduce<Date | null>(
    (m, d) => (m && m > d.fetchedAt ? m : d.fetchedAt),
    null,
  );

  let cumSales = 0;
  let cumVariation = 0;
  const rows: DsrRow[] = inMonth.map((d) => {
    const netMeter = toNum(d.officialSaleLitres);
    const test = toNum(d.testLitres);
    cumSales += netMeter;

    const hasStock = d.openingStock !== null;
    const opening = hasStock ? toNum(d.openingStock) : undefined;
    const receipt = hasStock ? toNum(d.receiptQty) : undefined;
    const total = opening !== undefined ? opening + (receipt ?? 0) : undefined;

    const nextOpening = openingByTime.get(d.businessDate.getTime() + 86400000);
    const closing = d.closingStock !== null ? toNum(d.closingStock) : undefined;
    const dipBase = nextOpening ?? closing;
    const byDip = total !== undefined && dipBase !== undefined ? total - dipBase : undefined;
    const provisional = byDip !== undefined && nextOpening === undefined;

    const variation = byDip !== undefined ? netMeter - byDip : undefined;
    if (variation !== undefined) cumVariation += variation;

    return {
      date: d.businessDate.toISOString().slice(0, 10),
      opening,
      receipt,
      total,
      byMeter: netMeter + test,
      test,
      netMeter,
      cumSales,
      byDip,
      provisional,
      variation,
      cumVariation: variation !== undefined ? cumVariation : undefined,
    };
  });

  const monthLabel = start.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const anyProvisional = rows.some((r) => r.provisional);
  const anyMissingStock = rows.some((r) => r.opening === undefined);

  const vCls = (n: number | undefined) =>
    n === undefined || n === 0
      ? "text-muted"
      : n < 0
        ? "text-red-600 dark:text-red-400"
        : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-3 rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border print:hidden">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Month</span>
            <AutoSubmitDate
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border border-border px-3 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Product</span>
            <AutoSubmitSelect
              name="product"
              defaultValue={product}
              className="rounded-lg border border-border px-3 py-1.5"
            >
              <option value="MS">MS (Petrol)</option>
              <option value="HSD">HSD (Diesel)</option>
            </AutoSubmitSelect>
          </label>
        </form>
        {rows.length > 0 && <PrintButton />}
      </div>

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Daily sales register · {product} · {monthLabel}
          </h2>
          <p className="text-xs text-muted">
            {rows.length} day{rows.length === 1 ? "" : "s"} cached from CRIS
            {lastFetched
              ? ` · last updated ${lastFetched.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
              : ""}
          </p>
        </div>
        <p className="mb-2 text-xs text-muted print:hidden">
          All figures in litres, from the CRIS Daily Sales report. Sales by dip = total
          stock − next day&apos;s opening stock · variation = net sales by meter − sales by
          dip (negative = tank lost more than the meters sold).
        </p>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">
            Nothing cached from CRIS for this month — fetch it from the CRIS tab.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 text-right font-medium">Opening stock</th>
                  <th className="px-2 py-1.5 text-right font-medium">Receipt</th>
                  <th className="px-2 py-1.5 text-right font-medium">Total stock</th>
                  <th className="px-2 py-1.5 text-right font-medium">Sales by meter</th>
                  <th className="px-2 py-1.5 text-right font-medium">Pump test</th>
                  <th className="px-2 py-1.5 text-right font-medium">Net sales by meter</th>
                  <th className="px-2 py-1.5 text-right font-medium">Cumulative sales</th>
                  <th className="px-2 py-1.5 text-right font-medium">Sales by dip</th>
                  <th className="px-2 py-1.5 text-right font-medium">Variation</th>
                  <th className="px-2 py-1.5 text-right font-medium">Cum. variation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} className="border-t border-border">
                    <td className="px-2 py-1.5 font-medium text-foreground">{dayLabel(r.date)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{L(r.opening)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.receipt ? L(r.receipt) : r.receipt === 0 ? "0" : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{L(r.total)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{L(r.byMeter)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{L(r.test)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">{L(r.netMeter)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{L(r.cumSales)}</td>
                    <td className={"px-2 py-1.5 text-right tabular-nums" + (r.provisional ? " italic text-muted" : "")}>
                      {L(r.byDip)}
                      {r.provisional && "*"}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${vCls(r.variation)}`}>
                      {L(r.variation)}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${vCls(r.cumVariation)}`}>
                      {L(r.cumVariation)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(anyProvisional || anyMissingStock) && (
          <p className="mt-2 text-xs text-faint">
            {anyProvisional &&
              "* provisional — computed from the same day's closing stock; it settles once the next day's report is fetched. "}
            {anyMissingStock &&
              "Days showing — for stock were cached before stock tracking; re-fetch that date range from the CRIS tab to fill them."}
          </p>
        )}
      </section>
    </div>
  );
}
