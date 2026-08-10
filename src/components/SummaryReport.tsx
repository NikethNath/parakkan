import { inr, istToday, dayLabel } from "@/lib/format";
import { buildSummary, emptySummaryRow, SUMMARY_COLS, type Summary } from "@/lib/summary";
import PrintButton from "@/components/PrintButton";
import AutoSubmitDate from "@/components/AutoSubmitDate";

// The per-day summary table with period totals. Shared by the admin Summary
// tab and the accountant's read-only /accounts page (it only reads data, so
// it's safe for both).

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");
const L = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = (n: number, kind: "L" | "money" | "rate") => {
  if (kind === "L") return L(n);
  if (kind === "money") return inr(n);
  return n > 0 ? `₹${L(n)}` : "—"; // rate: no litres sold, no rate to quote
};

export default async function SummaryReport({
  from,
  to,
}: {
  from?: string;
  to?: string;
}) {
  const today = istToday();
  const hasRange = isDate(from) && isDate(to);
  const fromRaw = isDate(from) ? from! : "";
  const toRaw = isDate(to) ? to! : "";
  const lo = !hasRange ? "" : fromRaw <= toRaw ? fromRaw : toRaw;
  const hi = !hasRange ? "" : fromRaw <= toRaw ? toRaw : fromRaw;

  const { days, totals }: Summary = hasRange
    ? await buildSummary(lo, hi)
    : { days: [], totals: emptySummaryRow() };

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
        {hasRange && (
          <div className="flex items-center gap-2">
            {days.length > 0 && (
              <a
                href={`/api/reports/summary?from=${lo}&to=${hi}`}
                className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-surface-2 print:hidden"
              >
                Export Excel
              </a>
            )}
            <PrintButton />
          </div>
        )}
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
              {days.length} day{days.length === 1 ? "" : "s"} with activity
            </p>
          </div>

          {days.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">No data in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    {SUMMARY_COLS.map((c) => (
                      <th key={c.label} className="px-2 py-1.5 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map(({ date, row }) => (
                    <tr key={date} className="border-t border-border">
                      <td className="px-2 py-1.5 font-medium text-foreground">{dayLabel(date)}</td>
                      {SUMMARY_COLS.map((c) => (
                        <td key={c.label} className="px-2 py-1.5 text-right tabular-nums">
                          {fmt(c.value(row), c.kind)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-2 py-2">Total</td>
                    {SUMMARY_COLS.map((c) => (
                      <td key={c.label} className="px-2 py-2 text-right tabular-nums">
                        {fmt(c.value(totals), c.kind)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-faint print:hidden">
            Rates are what was actually realised (value ÷ saleable litres), so the total
            row averages by value if the pump rate changed inside the period.
          </p>
        </section>
      )}
    </>
  );
}
