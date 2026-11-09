import { prisma } from "@/lib/db";
import { crisStatus } from "@/lib/crisCreds";
import { toNum, isoDate } from "@/lib/format";
import CrisReportUpload from "@/components/CrisReportUpload";
import CrisFetchForm from "@/components/CrisFetchForm";
import CrisCompare from "@/components/CrisCompare";
import AutoSubmitDate from "@/components/AutoSubmitDate";
import { CRIS_TOLERANCE, type CrisCompareRow } from "@/lib/crisCompare";

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}
const fmtL = (n: number) => `${n.toFixed(2)} L`;

export default async function CrisPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month ?? isoDate(new Date()).slice(0, 7);
  const { start, end } = monthBounds(month);

  const { configured } = await crisStatus();

  const [crisRows, entries, crisAgg, bankAgg, entryAgg, maintenance] = await Promise.all([
    prisma.crisDaily.findMany({ where: { businessDate: { gte: start, lt: end } } }),
    prisma.dailyEntry.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: { businessDate: true, product: true, netSalableLitres: true },
    }),
    prisma.crisDaily.aggregate({
      _max: { fetchedAt: true, businessDate: true },
      _count: { _all: true },
    }),
    prisma.bankTxn.aggregate({ _max: { businessDate: true }, _min: { businessDate: true } }),
    prisma.dailyEntry.aggregate({ _max: { businessDate: true }, _min: { businessDate: true } }),
    // Repairmen's unauthorised tests, which CRIS counted as sales.
    prisma.maintenanceTest.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: { businessDate: true, product: true, litres: true, note: true },
    }),
  ]);

  // Pre-fill the CRIS fetch range to RE-FETCH the last cached day (it may have
  // been cached while that day was still in progress / incomplete) through today.
  const todayIso = isoDate(new Date());
  const crisMax = crisAgg._max.businessDate;
  const minDates = [bankAgg._min.businessDate, entryAgg._min.businessDate]
    .filter((d): d is Date => !!d)
    .map(isoDate);
  const oldest = minDates.length ? minDates.sort()[0] : isoDate(start);

  const fetchFrom = crisMax ? isoDate(crisMax) : oldest; // last cached day, inclusive
  const newest = todayIso;
  const build = (product: "MS" | "HSD"): CrisCompareRow[] => {
    const map = new Map<string, CrisCompareRow>();
    const blank = (date: string): CrisCompareRow => ({
      date,
      cris: null,
      maintenance: 0,
      maintenanceNote: null,
      staff: 0,
    });
    for (const c of crisRows.filter((r) => r.product === product)) {
      const d = isoDate(c.businessDate);
      map.set(d, { ...blank(d), cris: toNum(c.officialSaleLitres) });
    }
    for (const e of entries.filter((r) => r.product === product)) {
      const d = isoDate(e.businessDate);
      const cur = map.get(d) ?? blank(d);
      cur.staff += toNum(e.netSalableLitres);
      map.set(d, cur);
    }
    for (const m of maintenance.filter((r) => r.product === product)) {
      const d = isoDate(m.businessDate);
      const cur = map.get(d) ?? blank(d);
      cur.maintenance = toNum(m.litres);
      cur.maintenanceNote = m.note;
      map.set(d, cur);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  };

  const monthLabel = start.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const lastFetched = crisAgg._max.fetchedAt
    ? crisAgg._max.fetchedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <>
      <CrisFetchForm configured={configured} defaultFrom={fetchFrom} defaultTo={newest} />
      <CrisReportUpload />

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">CRIS vs staff — {monthLabel}</h2>
            <p className="text-xs text-muted">
              Net Totalizer Sales (CRIS) vs net salable litres entered by staff. Δ = staff −
              CRIS, after taking off any maintenance test; off by &gt; {fmtL(CRIS_TOLERANCE)} is
              flagged.
            </p>
            {lastFetched ? (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                ✓ {crisAgg._count._all} day-rows stored (cached) · last updated {lastFetched}.
                Viewing never re-contacts CRIS.
              </p>
            ) : (
              <p className="mt-1 text-xs text-faint">No CRIS data stored yet.</p>
            )}
          </div>
          <form className="flex items-end gap-2">
            <AutoSubmitDate
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
            />
          </form>
        </div>

        <CrisCompare ms={build("MS")} hsd={build("HSD")} />
      </section>

      <section className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
        <strong>Note:</strong> auto-fetch is experimental. CRIS allows only one active session,
        so it can only run when you&apos;re logged out of CRIS, and a failed run may briefly
        block the next login. The <strong>manual upload</strong> above always works as a fallback.
      </section>
    </>
  );
}

