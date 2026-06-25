import { prisma } from "@/lib/db";
import { isoDate } from "@/lib/format";
import AttendanceDay from "@/components/AttendanceDay";

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const today = new Date();
  const month = sp.month ?? isoDate(today).slice(0, 7);
  const date = sp.date ?? isoDate(today);
  const { start, end } = monthBounds(month);
  const dayDate = new Date(`${date}T00:00:00.000Z`);

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const monthRows = await prisma.attendance.findMany({
    where: { status: "PRESENT", date: { gte: start, lt: end } },
    select: { employeeId: true, date: true, shift: true },
  });

  // employeeId -> { distinct days, shift count }
  const summary = new Map<number, { days: Set<string>; shifts: number }>();
  for (const r of monthRows) {
    const cur = summary.get(r.employeeId) ?? { days: new Set<string>(), shifts: 0 };
    cur.days.add(isoDate(r.date));
    cur.shifts += 1;
    summary.set(r.employeeId, cur);
  }

  const dayRows = await prisma.attendance.findMany({
    where: { date: dayDate },
    select: { employeeId: true, shift: true, status: true },
  });
  const dayMap = new Map<number, { MORNING?: string; EVENING?: string }>();
  for (const r of dayRows) {
    const cur = dayMap.get(r.employeeId) ?? {};
    cur[r.shift] = r.status;
    dayMap.set(r.employeeId, cur);
  }
  const dayRowsForClient = employees.map((e) => {
    const d = dayMap.get(e.id) ?? {};
    return {
      employeeId: e.id,
      name: e.name,
      morning: (d.MORNING ?? null) as "PRESENT" | "ABSENT" | "LEAVE" | null,
      evening: (d.EVENING ?? null) as "PRESENT" | "ABSENT" | "LEAVE" | null,
    };
  });

  const monthLabel = start.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const dayLabel = dayDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <form className="flex flex-wrap items-end gap-3 rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Month</span>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="rounded-lg border border-border px-3 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Day</span>
          <input
            type="date"
            name="date"
            defaultValue={date}
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Days present — {monthLabel}
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-2 py-1.5 font-medium">Employee</th>
              <th className="px-2 py-1.5 text-right font-medium">Days present</th>
              <th className="px-2 py-1.5 text-right font-medium">Shifts worked</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const s = summary.get(e.id);
              return (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-2 py-1.5 font-medium text-foreground">{e.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {s ? s.days.size : 0}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                    {s ? s.shifts : 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Attendance — {dayLabel}
        </h2>
        <p className="mb-3 text-xs text-muted">
          Set each person&apos;s status for this day (pick another day above). Changes save
          instantly and feed the month totals + salary.
        </p>
        <AttendanceDay date={date} rows={dayRowsForClient} />
      </section>
    </>
  );
}
