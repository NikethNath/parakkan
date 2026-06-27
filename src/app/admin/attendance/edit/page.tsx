import { prisma } from "@/lib/db";
import { isoDate, istToday } from "@/lib/format";
import AttendanceDay from "@/components/AttendanceDay";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

export default async function EditAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();
  const date = isDate(sp.date) ? sp.date! : today;
  const dayDate = new Date(`${date}T00:00:00.000Z`);

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

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
          <span className="mb-1 block font-medium text-foreground">Day</span>
          <input
            type="date"
            name="date"
            defaultValue={date}
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
