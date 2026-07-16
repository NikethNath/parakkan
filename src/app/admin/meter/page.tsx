import { prisma } from "@/lib/db";
import { crisStatus } from "@/lib/crisCreds";
import { isoDate, istToday, dayBoundsUTC, dayLabel, toNum } from "@/lib/format";
import AutoSubmitDate from "@/components/AutoSubmitDate";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import CrisMeterFetchForm from "@/components/CrisMeterFetchForm";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

// The station has 4 MS nozzles and 2 HSD nozzles. Each sheet holds 2 nozzles, so
// the 4 MS readings come from two morning MS sheets and the 2 HSD from one.
const MS_NOZZLES = 4;
const HSD_NOZZLES = 2;

type Side = { open: number[]; close: number[] };
type Row = {
  date: string;
  ms: Side;
  hsd: Side;
  // Official CRIS totalizers (sorted ascending, like the staff values).
  cris?: { ms: Side; hsd: Side };
};

const fmt = (n: number | undefined) =>
  n === undefined
    ? "—"
    : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Subscript under a staff reading: the CRIS official totalizer for the same
 *  (sorted) position — green when it matches (within 0.05), red when it's off
 *  by 0.05 or more. */
function CrisSub({ staff, cris }: { staff?: number; cris?: number }) {
  if (cris === undefined) return null;
  const cls =
    staff === undefined
      ? "text-faint"
      : Math.abs(staff - cris) < 0.05
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400";
  return <div className={`text-[10px] leading-tight tabular-nums ${cls}`}>{fmt(cris)}</div>;
}

// Staff sometimes swap opening/closing, so the opening is the smaller reading (a
// totalizer only counts up). Ignore an unfilled 0 — fall back to the real value.
function pickOpening(open: number, close: number): number {
  const lo = Math.min(open, close);
  const hi = Math.max(open, close);
  return lo > 0 ? lo : hi;
}

// The closing is the larger reading — max() also resolves a swapped pair or an
// unfilled 0 to the real value.
const pickClosing = (open: number, close: number) => Math.max(open, close);

export default async function MeterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();
  // Which reading to show: day openings (default) or day closings.
  const view: keyof Side = sp.view === "close" ? "close" : "open";
  // No default range — pick a start and end date to load the readings.
  const hasRange = isDate(sp.from) && isDate(sp.to);
  const fromRaw = isDate(sp.from) ? sp.from! : "";
  const toRaw = isDate(sp.to) ? sp.to! : "";
  const lo = !hasRange ? "" : fromRaw <= toRaw ? fromRaw : toRaw;
  const hi = !hasRange ? "" : fromRaw <= toRaw ? toRaw : fromRaw;

  // Day openings come from the MORNING sheets, day closings from the EVENING
  // sheets (the evening close is the last reading of the business day).
  const entries = hasRange
    ? await prisma.dailyEntry.findMany({
        where: {
          businessDate: { gte: dayBoundsUTC(lo).start, lt: dayBoundsUTC(hi).end },
        },
        orderBy: [{ businessDate: "desc" }, { id: "asc" }],
        select: {
          businessDate: true,
          shift: true,
          product: true,
          n1Open: true,
          n1Close: true,
          n2Open: true,
          n2Close: true,
        },
      })
    : [];

  // Official per-pump totalizers cached from the CRIS Transaction Report
  // (pumps 1–2 HSD, 3–6 MS) — shown in subscript under each staff value.
  const crisReadings = hasRange
    ? await prisma.crisPumpDaily.findMany({
        where: { businessDate: { gte: dayBoundsUTC(lo).start, lt: dayBoundsUTC(hi).end } },
        orderBy: [{ businessDate: "asc" }, { pump: "asc" }],
        select: {
          businessDate: true,
          product: true,
          openTotalizer: true,
          closeTotalizer: true,
        },
      })
    : [];

  const { configured } = await crisStatus();

  const map = new Map<string, Row>();
  const rowFor = (d: string) => {
    const row =
      map.get(d) ??
      ({ date: d, ms: { open: [], close: [] }, hsd: { open: [], close: [] } } as Row);
    map.set(d, row);
    return row;
  };
  for (const e of entries) {
    const row = rowFor(isoDate(e.businessDate));
    const side = e.product === "MS" ? row.ms : row.hsd;
    if (e.shift === "MORNING") {
      side.open.push(
        pickOpening(toNum(e.n1Open), toNum(e.n1Close)),
        pickOpening(toNum(e.n2Open), toNum(e.n2Close)),
      );
    } else {
      side.close.push(
        pickClosing(toNum(e.n1Open), toNum(e.n1Close)),
        pickClosing(toNum(e.n2Open), toNum(e.n2Close)),
      );
    }
  }
  for (const c of crisReadings) {
    const row = rowFor(isoDate(c.businessDate));
    row.cris ??= { ms: { open: [], close: [] }, hsd: { open: [], close: [] } };
    const side = c.product === "MS" ? row.cris.ms : row.cris.hsd;
    side.open.push(toNum(c.openTotalizer));
    side.close.push(toNum(c.closeTotalizer));
  }
  // Chronological ledger: oldest day at the top, most recent at the bottom.
  const rows = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  // Submission order is unreliable, so sort each product's readings ascending
  // (MS and HSD independently) — N1 is the lowest, up to the highest. CRIS
  // readings are sorted the same way so the columns line up for comparison.
  for (const r of rows) {
    for (const side of [r.ms, r.hsd, r.cris?.ms, r.cris?.hsd]) {
      side?.open.sort((a, b) => a - b);
      side?.close.sort((a, b) => a - b);
    }
  }
  const hasCris = rows.some((r) => r.cris);

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
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Reading</span>
          <AutoSubmitSelect
            name="view"
            defaultValue={view}
            className="rounded-lg border border-border px-3 py-1.5"
          >
            <option value="open">Opening</option>
            <option value="close">Closing</option>
          </AutoSubmitSelect>
        </label>
      </form>

      <CrisMeterFetchForm configured={configured} />

      {!hasRange ? (
        <p className="px-1 text-sm text-muted">
          Pick a start and end date to see the day&apos;s opening and closing meter readings.
        </p>
      ) : (
        <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {view === "open" ? "Opening" : "Closing"} meter readings · {dayLabel(lo)} –{" "}
              {dayLabel(hi)}
            </h2>
            <p className="text-xs text-muted">
              From the {view === "open" ? "morning" : "evening"} sheets · {rows.length} day
              {rows.length === 1 ? "" : "s"}
            </p>
          </div>
          {hasCris && (
            <p className="mb-2 text-xs text-muted">
              Small figure under a reading = the official CRIS reading for that nozzle
              (both sorted low → high) ·{" "}
              <span className="text-emerald-600 dark:text-emerald-400">green = matches</span> ·{" "}
              <span className="text-red-600 dark:text-red-400">red = staff entered something
              different</span>.
            </p>
          )}
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              No sheets in this period.
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
                      <td className="whitespace-nowrap px-2 py-1.5 align-top text-muted">
                        {dayLabel(r.date)}
                      </td>
                      {msCols.map((i) => (
                        <td
                          key={`ms${i}`}
                          className="px-2 py-1.5 text-right tabular-nums text-foreground"
                        >
                          {fmt(r.ms[view][i])}
                          <CrisSub staff={r.ms[view][i]} cris={r.cris?.ms[view][i]} />
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
                          {fmt(r.hsd[view][i])}
                          <CrisSub staff={r.hsd[view][i]} cris={r.cris?.hsd[view][i]} />
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
