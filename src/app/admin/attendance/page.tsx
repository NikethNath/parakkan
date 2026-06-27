import { prisma } from "@/lib/db";
import { isoDate, istToday, dayBoundsUTC, dayLabel } from "@/lib/format";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

export default async function ViewAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();
  const toRaw = isDate(sp.to) ? sp.to! : today;
  const fromRaw = isDate(sp.from) ? sp.from! : today.slice(0, 8) + "01"; // 1st of this month

  // Both inclusive; tolerate a reversed range by ordering the bounds.
  const lo = fromRaw <= toRaw ? fromRaw : toRaw;
  const hi = fromRaw <= toRaw ? toRaw : fromRaw;
  const start = new Date(lo + "T00:00:00.000Z");
  const endExclusive = dayBoundsUTC(hi).end;

  const rows = await prisma.attendance.findMany({
    where: { status: "PRESENT", date: { gte: start, lt: endExclusive } },
    select: {
      employeeId: true,
      date: true,
      employee: { select: { name: true, active: true } },
    },
  });

  // employeeId -> { id, name, active, distinct days present, shift count }
  const summary = new Map<
    number,
    { id: number; name: string; active: boolean; days: Set<string>; shifts: number }
  >();
  for (const r of rows) {
    const cur =
      summary.get(r.employeeId) ??
      {
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
  const list = [...summary.values()].sort(
    (a, b) => b.days.size - a.days.size || a.name.localeCompare(b.name),
  );

  const spanDays =
    Math.round((endExclusive.getTime() - start.getTime()) / 86_400_000);

  return (
    <>
      <form className="flex flex-wrap items-end gap-3 rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">From</span>
          <input
            type="date"
            name="from"
            defaultValue={lo}
            max={today}
            className="rounded-lg border border-border px-3 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">To</span>
          <input
            type="date"
            name="to"
            defaultValue={hi}
            max={today}
            className="rounded-lg border border-border px-3 py-1.5"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-1.5 font-medium text-white hover:bg-accent-strong"
        >
          Apply
        </button>
      </form>

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
          <p className="py-6 text-center text-sm text-faint">No one was marked present in this period.</p>
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
    </>
  );
}
