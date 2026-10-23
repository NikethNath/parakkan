import { prisma } from "@/lib/db";
import { crisStatus } from "@/lib/crisCreds";
import { inr, isoDate, istToday, dayBoundsUTC, dayLabel, toNum } from "@/lib/format";
import AutoSubmitDate from "@/components/AutoSubmitDate";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import CrisMeterFetchForm from "@/components/CrisMeterFetchForm";
import MeterQuickFix from "@/components/MeterQuickFix";
import {
  alignSide,
  assignFills,
  type Fill,
  type MissingSlot,
  type Reading,
} from "@/lib/meterAlign";
import { handoverRows, type HandoverRow, type HandoverSide } from "@/lib/meterHandover";
import HandoverTable from "@/components/HandoverTable";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

// The station has 4 MS nozzles and 2 HSD nozzles. Each sheet holds 2 nozzles, so
// the 4 MS readings come from two morning MS sheets and the 2 HSD from one.
const MS_NOZZLES = 4;
const HSD_NOZZLES = 2;

type Side = {
  open: Reading[];
  close: Reading[];
  // Sheet nozzles with no reading for that side — offered a "Fill ← CRIS".
  missOpen: MissingSlot[];
  missClose: MissingSlot[];
  // The midday totalizers, with enough about their sheets to compare the two
  // sides and repair whichever was typed wrong. Morning closes and evening
  // opens are the same dial read once, so they must agree — see
  // src/lib/meterHandover.ts. Their plain values also complete a fully blank
  // nozzle pair on the other shift's sheet.
  handMorning: HandoverSide[];
  handEvening: HandoverSide[];
};
/** Which reading the table shows. "handover" lists the midday disagreements. */
type View = "open" | "close" | "handover";
type CrisSide = { open: number[]; close: number[] };
type Row = {
  date: string;
  ms: Side;
  hsd: Side;
  // Official CRIS totalizers (sorted ascending, like the staff values).
  cris?: { ms: CrisSide; hsd: CrisSide };
};

const emptySide = (): Side => ({
  open: [],
  close: [],
  missOpen: [],
  missClose: [],
  handMorning: [],
  handEvening: [],
});

const fmt = (n: number | undefined) =>
  n === undefined
    ? "—"
    : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Subscript under a staff reading: the official CRIS totalizer this reading
 *  was paired with — green when it matches (within 0.05), red when it's off by
 *  0.05 or more, grey when the nozzle has no staff reading at all. */
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

/** One table cell: the staff reading, the CRIS subscript, who wrote it, and a
 *  quick-fix button — "Fix → CRIS" when the reading disagrees with CRIS, or
 *  "Fill ← CRIS" when the staff reading is missing but a sheet can take it. */
function ReadingCell({ reading, cris, fill }: { reading?: Reading; cris?: number; fill?: Fill }) {
  const flagged =
    reading !== undefined && cris !== undefined && Math.abs(reading.v - cris) >= 0.05;
  // A sheet was submitted with this reading left unfilled → show the 0 the
  // staff wrote; a dash means no sheet covered this nozzle at all.
  const by = reading?.by ?? fill?.by;
  return (
    <>
      {reading ? fmt(reading.v) : fill ? fmt(0) : "—"}
      <CrisSub staff={reading?.v} cris={cris} />
      {by && <div className="text-[10px] leading-tight text-faint">{by}</div>}
      {flagged && (
        <MeterQuickFix
          entryId={reading.entryId}
          writes={[{ field: reading.field, value: cris }]}
          from={reading.v}
          by={reading.by}
        />
      )}
      {!reading && fill && (
        <MeterQuickFix entryId={fill.entryId} writes={fill.writes} by={fill.by} />
      )}
    </>
  );
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
  // Which reading to show: day openings (default), day closings, or the midday
  // handover disagreements.
  const view: View =
    sp.view === "close" ? "close" : sp.view === "handover" ? "handover" : "open";
  // Which of the two reading columns the ledger table shows. The handover view
  // renders its own table, so it falls back to the opening here.
  const readingSide: "open" | "close" = view === "close" ? "close" : "open";
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
          id: true,
          businessDate: true,
          shift: true,
          product: true,
          n1Open: true,
          n1Close: true,
          n2Open: true,
          n2Close: true,
          // Needed to work out which shift's reading is the wrong one: the
          // gap × rate should show up in that sheet's short/excess.
          rate: true,
          shortExcess: true,
          employee: { select: { name: true } },
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
      ({ date: d, ms: emptySide(), hsd: emptySide() } as Row);
    map.set(d, row);
    return row;
  };
  for (const e of entries) {
    const row = rowFor(isoDate(e.businessDate));
    const side = e.product === "MS" ? row.ms : row.hsd;
    const by = e.employee.name;
    // Record which stored field the shown value came from (a legacy swapped
    // pair may surface its opening from nClose) so quick-fix edits the right one.
    const n1o = toNum(e.n1Open), n1c = toNum(e.n1Close);
    const n2o = toNum(e.n2Open), n2c = toNum(e.n2Close);
    // Per nozzle pair: a totalizer is never 0, so a 0 means "not recorded".
    // Both filled → swap-resolved reading (staff sometimes switch the columns).
    // Only this side filled → shown as-is. This side missing → a MissingSlot,
    // which becomes a "Fill ← CRIS" button on the official-only cell.
    const pairs = [
      { o: n1o, c: n1c, fo: "n1Open", fc: "n1Close" },
      { o: n2o, c: n2c, fo: "n2Open", fc: "n2Close" },
    ] as const;
    const rate = toNum(e.rate);
    const shortExcess = toNum(e.shortExcess);
    if (e.shift === "MORNING") {
      for (const p of pairs) {
        if (p.o > 0 && p.c > 0) {
          const v = pickOpening(p.o, p.c);
          side.open.push({ v, by, entryId: e.id, field: v === p.o ? p.fo : p.fc });
          // The morning's closing is the midday reading. Its field is whichever
          // column actually holds it, and its bound is the day's opening — a
          // repair must not be written below that.
          const close = pickClosing(p.o, p.c);
          side.handMorning.push({
            entryId: e.id,
            field: close === p.c ? p.fc : p.fo,
            value: close,
            by,
            rate,
            shortExcess,
            bound: v,
          });
        } else if (p.o > 0) {
          side.open.push({ v: p.o, by, entryId: e.id, field: p.fo });
        } else if (p.c > 0) {
          side.missOpen.push({ by, entryId: e.id, sideField: p.fo, siblingField: p.fc, siblingValue: p.c });
        } else {
          side.missOpen.push({ by, entryId: e.id, sideField: p.fo, siblingField: p.fc });
        }
      }
    } else {
      for (const p of pairs) {
        if (p.o > 0 && p.c > 0) {
          const v = pickClosing(p.o, p.c);
          side.close.push({ v, by, entryId: e.id, field: v === p.c ? p.fc : p.fo });
          // The evening's opening is the same midday reading, bounded above by
          // its own closing.
          const open = pickOpening(p.o, p.c);
          side.handEvening.push({
            entryId: e.id,
            field: open === p.o ? p.fo : p.fc,
            value: open,
            by,
            rate,
            shortExcess,
            bound: v,
          });
        } else if (p.c > 0) {
          side.close.push({ v: p.c, by, entryId: e.id, field: p.fc });
        } else if (p.o > 0) {
          side.missClose.push({ by, entryId: e.id, sideField: p.fc, siblingField: p.fo, siblingValue: p.o });
        } else {
          side.missClose.push({ by, entryId: e.id, sideField: p.fc, siblingField: p.fo });
        }
      }
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
  // Midday disagreements across the whole loaded range, so the warning strip
  // shows up whichever view is on screen.
  const mismatches: { date: string; product: "MS" | "HSD"; row: HandoverRow }[] = rows.flatMap(
    (r) =>
      (["MS", "HSD"] as const).flatMap((product) =>
        handoverRows(
          product === "MS" ? r.ms.handMorning : r.hsd.handMorning,
          product === "MS" ? r.ms.handEvening : r.hsd.handEvening,
        ).map((row) => ({ date: r.date, product, row })),
      ),
  );
  const mismatchDays = new Set(mismatches.map((m) => m.date)).size;
  // Submission order is unreliable, so sort each product's readings ascending
  // (MS and HSD independently) — N1 is the lowest, up to the highest. CRIS
  // readings are sorted the same way so the columns line up for comparison.
  for (const r of rows) {
    for (const side of [r.ms, r.hsd]) {
      side.open.sort((a, b) => a.v - b.v);
      side.close.sort((a, b) => a.v - b.v);
      side.handMorning.sort((a, b) => a.value - b.value);
      side.handEvening.sort((a, b) => a.value - b.value);
    }
    for (const side of [r.cris?.ms, r.cris?.hsd]) {
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
            <option value="handover">Midday handover</option>
          </AutoSubmitSelect>
        </label>
      </form>

      <CrisMeterFetchForm configured={configured} />

      {mismatches.length > 0 && view !== "handover" && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm dark:border-red-500/40 dark:bg-red-500/10 print:hidden">
          <strong className="font-semibold text-red-700 dark:text-red-300">
            {mismatches.length} midday handover {mismatches.length === 1 ? "reading" : "readings"}{" "}
            {mismatches.length === 1 ? "does" : "do"} not match
          </strong>{" "}
          <span className="text-red-700 dark:text-red-300">
            on {mismatchDays} {mismatchDays === 1 ? "day" : "days"} — a morning closing and the
            evening opening after it are the same dial, so one sheet was typed wrong and that
            day&apos;s litres are out.
          </span>{" "}
          <a
            href={`/admin/meter?from=${lo}&to=${hi}&view=handover`}
            className="font-medium text-red-700 underline dark:text-red-300"
          >
            Fix {mismatches.length === 1 ? "it" : "them"} →
          </a>
        </div>
      )}

      {!hasRange ? (
        <p className="px-1 text-sm text-muted">
          Pick a start and end date to see the day&apos;s opening and closing meter readings.
        </p>
      ) : view === "handover" ? (
        <HandoverTable items={mismatches} from={lo} to={hi} />
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
          <p className="mb-2 text-xs text-muted">
            {hasCris && (
              <>
                Small figure under a reading = the official CRIS reading for that nozzle
                (each staff reading is matched to the nearest official totalizer, so an
                unused nozzle shows just the official figure in grey) ·{" "}
                <span className="text-emerald-600 dark:text-emerald-400">green = matches</span> ·{" "}
                <span className="text-red-600 dark:text-red-400">red = staff entered something
                different</span> — its <strong>Fix → CRIS</strong> button replaces the staff
                reading with the official one (recalculated &amp; logged) · a reading the
                staff submitted but left unfilled shows as 0 with a{" "}
                <strong>Fill ← CRIS</strong> button that writes the official reading(s)
                into that sheet · a dash means no sheet covered that nozzle ·{" "}
              </>
            )}
            The name under a reading is the staff member who wrote that sheet.
          </p>
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
                  {rows.map((r) => {
                    const msCells = alignSide(
                      r.ms[readingSide],
                      r.cris?.ms[readingSide],
                      MS_NOZZLES,
                    );
                    const hsdCells = alignSide(
                      r.hsd[readingSide],
                      r.cris?.hsd[readingSide],
                      HSD_NOZZLES,
                    );
                    // Official-only cells offer to fill the sheet's missing
                    // reading(s); a blank pair completes its other side from
                    // the counterpart shift's midday totalizer.
                    if (readingSide === "open") {
                      assignFills(msCells, r.ms.missOpen, r.ms.handEvening.map((h) => h.value));
                      assignFills(hsdCells, r.hsd.missOpen, r.hsd.handEvening.map((h) => h.value));
                    } else {
                      assignFills(msCells, r.ms.missClose, r.ms.handMorning.map((h) => h.value));
                      assignFills(hsdCells, r.hsd.missClose, r.hsd.handMorning.map((h) => h.value));
                    }
                    return (
                      <tr key={r.date} className="border-t border-border">
                        <td className="whitespace-nowrap px-2 py-1.5 align-top text-muted">
                          {dayLabel(r.date)}
                        </td>
                        {msCols.map((i) => (
                          <td
                            key={`ms${i}`}
                            className="px-2 py-1.5 text-right tabular-nums text-foreground"
                          >
                            <ReadingCell {...msCells[i]} />
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
                            <ReadingCell {...hsdCells[i]} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
