import { prisma } from "@/lib/db";
import { isoDate, istToday, dayBoundsUTC, dayLabel } from "@/lib/format";
import AutoSubmitDate from "@/components/AutoSubmitDate";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

type Summary = {
  id: number;
  name: string;
  active: boolean;
  days: Set<string>;
  shifts: number;
};

export default async function ViewAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();
  // No default range — pick a start and end date (both inclusive) to load it.
  const hasRange = isDate(sp.from) && isDate(sp.to);
  const fromRaw = isDate(sp.from) ? sp.from! : "";
  const toRaw = isDate(sp.to) ? sp.to! : "";
  const lo = !hasRange ? "" : fromRaw <= toRaw ? fromRaw : toRaw;
  const hi = !hasRange ? "" : fromRaw <= toRaw ? toRaw : fromRaw;

  let list: Summary[] = [];
  let spanDays = 0;

  if (hasRange) {
    const start = dayBoundsUTC(lo).start;
    const endExclusive = dayBoundsUTC(hi).end;
    const rows = await prisma.attendance.findMany({
      where: { status: "PRESENT", date: { gte: start, lt: endExclusive } },
      select: {
        employeeId: true,
        date: true,
        employee: { select: { name: true, active: true } },
      },
    });

    const summary = new Map<number, Summary>();
    for (const r of rows) {
      const cur =
        summary.get(r.employeeId) ?? {
          id: r.employeeId,
          name: r.employee.name,
          active: r.employee.active,
          days: new Set<string>(),
          shifts: 0,
        };
      cur.days.add(isoDate(r.date));
      cur.shifts += 1;
      summary.set(r.employeeId, cur);
    }
    list = [...summary.values()].sort(
      (a, b) => b.days.size - a.days.size || a.name.localeCompare(b.name),
    );
    spanDays = Math.round((endExclusive.getTime() - start.getTime()) / 86_400_000);
  }

  return (
    <>
      <form className="flex flex-wrap items-end gap-3 rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
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
          Pick a start and end date to see who was present.
        </p>
      ) : (
        <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Present · {dayLabel(lo)} – {dayLabel(hi)}
            </h2>
            <p className="text-xs text-muted">
              {spanDays} day{spanDays === 1 ? "" : "s"} · {list.length} present
            </p>
          </div>

          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              No one was marked present in this period.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Employee</th>
                  <th className="px-2 py-1.5 text-right font-medium">Days present</th>
                  <th className="px-2 py-1.5 text-right font-medium">Shifts worked</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-2 py-1.5 font-medium text-foreground">
                      {s.name}
                      {!s.active && <span className="ml-1 text-xs text-faint">(inactive)</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.days.size}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted">{s.shifts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
