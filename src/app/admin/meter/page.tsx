import { prisma } from "@/lib/db";
import { isoDate, istToday, dayBoundsUTC, dayLabel, toNum } from "@/lib/format";
import AutoSubmitDate from "@/components/AutoSubmitDate";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

// The station has 4 MS nozzles and 2 HSD nozzles. Each sheet holds 2 nozzles, so
// the 4 MS readings come from two morning MS sheets and the 2 HSD from one.
const MS_NOZZLES = 4;
const HSD_NOZZLES = 2;

type Row = { date: string; ms: number[]; hsd: number[] };

const fmt = (n: number | undefined) =>
  n === undefined
    ? "—"
    : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Staff sometimes swap opening/closing, so the opening is the smaller reading (a
// totalizer only counts up). Ignore an unfilled 0 — fall back to the real value.
function pickOpening(open: number, close: number): number {
  const lo = Math.min(open, close);
  const hi = Math.max(open, close);
  return lo > 0 ? lo : hi;
}

export default async function MeterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();
  // No default range — pick a start and end date to load the readings.
  const hasRange = isDate(sp.from) && isDate(sp.to);
  const fromRaw = isDate(sp.from) ? sp.from! : "";
  const toRaw = isDate(sp.to) ? sp.to! : "";
  const lo = !hasRange ? "" : fromRaw <= toRaw ? fromRaw : toRaw;
  const hi = !hasRange ? "" : fromRaw <= toRaw ? toRaw : fromRaw;

  // Opening nozzle readings from the MORNING sheets, in submission order.
  const entries = hasRange
    ? await prisma.dailyEntry.findMany({
        where: {
          shift: "MORNING",
          businessDate: { gte: dayBoundsUTC(lo).start, lt: dayBoundsUTC(hi).end },
        },
        orderBy: [{ businessDate: "desc" }, { id: "asc" }],
        select: {
          businessDate: true,
          product: true,
          n1Open: true,
          n1Close: true,
          n2Open: true,
          n2Close: true,
        },
      })
    : [];

  const map = new Map<string, Row>();
  for (const e of entries) {
    const d = isoDate(e.businessDate);
    const row = map.get(d) ?? { date: d, ms: [], hsd: [] };
    const target = e.product === "MS" ? row.ms : row.hsd;
    target.push(
      pickOpening(toNum(e.n1Open), toNum(e.n1Close)),
      pickOpening(toNum(e.n2Open), toNum(e.n2Close)),
    );
    map.set(d, row);
  }
  const rows = [...map.values()].sort((a, b) => b.date.localeCompare(a.date));

  const msCols = Array.from({ length: MS_NOZZLES }, (_, i) => i);
  const hsdCols = Array.from({ length: HSD_NOZZLES }, (_, i) => i);

  return (
    <div className="space-y-4 pb-6">
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

      {!hasRange ? (
        <p className="px-1 text-sm text-muted">
          Pick a start and end date to see the morning opening meter readings.
        </p>
      ) : (
        <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Opening meter readings · {dayLabel(lo)} – {dayLabel(hi)}
            </h2>
            <p className="text-xs text-muted">
              From the morning sheets · {rows.length} day{rows.length === 1 ? "" : "s"}
            </p>
          </div>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              No morning sheets in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="px-2 py-1" />
                    <th
                      colSpan={MS_NOZZLES}
                      className="border-b border-border px-2 py-1 text-center font-semibold text-foreground"
                    >
                      MS
                    </th>
                    <th
                      colSpan={HSD_NOZZLES}
                      className="border-b border-l border-border px-2 py-1 text-center font-semibold text-foreground"
                    >
                      HSD
                    </th>
                  </tr>
                  <tr className="text-right">
                    <th className="px-2 py-1.5 text-left font-medium">Date</th>
                    {msCols.map((i) => (
                      <th key={`msh${i}`} className="px-2 py-1.5 font-medium">
                        N{i + 1}
                      </th>
                    ))}
                    {hsdCols.map((i) => (
                      <th
                        key={`hsdh${i}`}
                        className={"px-2 py-1.5 font-medium" + (i === 0 ? " border-l border-border" : "")}
                      >
                        N{i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.date} className="border-t border-border">
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                        {dayLabel(r.date)}
                      </td>
                      {msCols.map((i) => (
                        <td
                          key={`ms${i}`}
                          className="px-2 py-1.5 text-right tabular-nums text-foreground"
                        >
                          {fmt(r.ms[i])}
                        </td>
                      ))}
                      {hsdCols.map((i) => (
                        <td
                          key={`hsd${i}`}
                          className={
                            "px-2 py-1.5 text-right tabular-nums text-foreground" +
                            (i === 0 ? " border-l border-border" : "")
                          }
                        >
                          {fmt(r.hsd[i])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
