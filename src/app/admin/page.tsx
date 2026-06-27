import Link from "next/link";
import { prisma } from "@/lib/db";
import { inr, toNum, istDateTimeShort, istToday, dayBoundsUTC, dayLabel } from "@/lib/format";
import { shortExcessLabel } from "@/lib/calc";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();

  // The submissions list only appears once a date range is chosen; by default
  // the page shows just the "needs verification" alert below.
  const hasRange = isDate(sp.from) && isDate(sp.to);
  const fromRaw = isDate(sp.from) ? sp.from! : "";
  const toRaw = isDate(sp.to) ? sp.to! : "";
  const lo = !hasRange ? "" : fromRaw <= toRaw ? fromRaw : toRaw;
  const hi = !hasRange ? "" : fromRaw <= toRaw ? toRaw : fromRaw;

  // Global "needs verification" alert — independent of the date range.
  const unverified = await prisma.dailyEntry.findMany({
    where: { status: { not: "VERIFIED" } },
    orderBy: [{ businessDate: "desc" }, { id: "desc" }],
    take: 200,
    include: { employee: { select: { name: true } } },
  });

  const entries = hasRange
    ? await prisma.dailyEntry.findMany({
        where: {
          businessDate: { gte: new Date(lo + "T00:00:00.000Z"), lt: dayBoundsUTC(hi).end },
        },
        orderBy: [{ businessDate: "desc" }, { id: "desc" }],
        include: { employee: { select: { name: true } } },
      })
    : [];

  const totalShort = entries
    .filter((e) => toNum(e.shortExcess) < 0)
    .reduce((s, e) => s + toNum(e.shortExcess), 0);
  const totalExcess = entries
    .filter((e) => toNum(e.shortExcess) > 0)
    .reduce((s, e) => s + toNum(e.shortExcess), 0);
  const verifiedCount = entries.filter((e) => e.status === "VERIFIED").length;

  return (
    <>
      {unverified.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-soft dark:border-amber-500/30 dark:bg-amber-500/10">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <span aria-hidden>⚠</span>
            {unverified.length} submission{unverified.length === 1 ? "" : "s"} need cash verification
          </h2>
          <ul className="divide-y divide-amber-200/70 dark:divide-amber-500/20">
            {unverified.map((e) => {
              const se = toNum(e.shortExcess);
              const lbl = shortExcessLabel(se);
              return (
                <li key={e.id}>
                  <Link
                    href={`/admin/entries/${e.id}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm transition hover:opacity-75"
                  >
                    <span className="text-foreground">
                      <span className="font-medium">
                        {e.businessDate.toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </span>{" "}
                      · {e.shift === "MORNING" ? "Morning" : "Evening"} · {e.employee.name} ·{" "}
                      {e.product}
                    </span>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {lbl !== "BALANCED" && (
                        <span
                          className={
                            "tabular-nums " +
                            (lbl === "SHORT"
                              ? "text-red-600 dark:text-red-400"
                              : "text-emerald-600 dark:text-emerald-400")
                          }
                        >
                          {lbl} {inr(Math.abs(se))}
                        </span>
                      )}
                      <span className="font-medium text-amber-700 dark:text-amber-300">Review →</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <form className="flex flex-wrap items-end gap-3 rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border print:hidden">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">From</span>
          <input
            type="date"
            name="from"
            defaultValue={fromRaw}
            max={today}
            className="rounded-lg border border-border px-3 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">To</span>
          <input
            type="date"
            name="to"
            defaultValue={toRaw}
            max={today}
            className="rounded-lg border border-border px-3 py-1.5"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-1.5 font-medium text-white hover:bg-accent-strong"
        >
          Show
        </button>
      </form>

      {!hasRange ? (
        <p className="px-1 text-sm text-muted">
          Pick a start and end date above to list submissions for that period.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card label="Total excess (period)" value={inr(totalExcess)} tone="emerald" />
            <Card label="Total short (period)" value={inr(Math.abs(totalShort))} tone="red" />
          </div>

          <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Submissions · {dayLabel(lo)} – {dayLabel(hi)}
              </h2>
              <p className="text-xs text-muted">
                {entries.length} submission{entries.length === 1 ? "" : "s"} · {verifiedCount} cash
                verified
              </p>
            </div>
            {entries.length === 0 ? (
              <p className="py-6 text-center text-sm text-faint">No submissions in this period.</p>
            ) : (
              <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Shift</th>
                  <th className="px-2 py-1.5 font-medium">Employee</th>
                  <th className="px-2 py-1.5 font-medium">Product</th>
                  <th className="px-2 py-1.5 text-right font-medium">Short / Excess</th>
                  <th className="px-2 py-1.5 font-medium">Submitted (IST)</th>
                  <th className="px-2 py-1.5 text-center font-medium">Cash verified</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const se = toNum(e.shortExcess);
                  const lbl = shortExcessLabel(se);
                  return (
                    <tr key={e.id} className="border-t border-border hover:bg-surface-2">
                      <td className="px-2 py-1.5">
                        {e.businessDate.toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </td>
                      <td className="px-2 py-1.5">
                        {e.shift === "MORNING" ? "Morning" : "Evening"}
                      </td>
                      <td className="px-2 py-1.5">{e.employee.name}</td>
                      <td className="px-2 py-1.5">{e.product}</td>
                      <td
                        className={
                          "px-2 py-1.5 text-right font-medium tabular-nums " +
                          (lbl === "SHORT"
                            ? "text-red-600 dark:text-red-400"
                            : lbl === "EXCESS"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted")
                        }
                      >
                        {lbl === "BALANCED" ? "—" : `${lbl} ${inr(Math.abs(se))}`}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted">
                        {istDateTimeShort(e.submittedAt)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {e.status === "VERIFIED" ? (
                          <span
                            title="Cash verified"
                            className="font-bold text-emerald-600 dark:text-emerald-400"
                          >
                            ✓
                          </span>
                        ) : (
                          <span title="Not yet verified" className="text-faint">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Link
                          href={`/admin/entries/${e.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "red";
}) {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          "mt-1 text-2xl font-bold " +
          (tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
        }
      >
        {value}
      </p>
    </div>
  );
}
