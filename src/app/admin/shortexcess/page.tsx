import { prisma } from "@/lib/db";
import { inr, toNum, istToday, dayBoundsUTC, dayLabel } from "@/lib/format";
import AutoSubmitDate from "@/components/AutoSubmitDate";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import PrintButton from "@/components/PrintButton";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

export default async function ShortExcessPage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();

  const staff = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, active: true },
  });

  const staffId = Number(sp.staff);
  const selected = staff.find((s) => s.id === staffId) ?? null;

  const hasRange = isDate(sp.from) && isDate(sp.to);
  const fromRaw = isDate(sp.from) ? sp.from! : "";
  const toRaw = isDate(sp.to) ? sp.to! : "";
  const lo = !hasRange ? "" : fromRaw <= toRaw ? fromRaw : toRaw;
  const hi = !hasRange ? "" : fromRaw <= toRaw ? toRaw : fromRaw;

  const ready = !!selected && hasRange;

  const rows = ready
    ? await prisma.dailyEntry.findMany({
        where: {
          employeeId: selected!.id,
          businessDate: { gte: dayBoundsUTC(lo).start, lt: dayBoundsUTC(hi).end },
        },
        select: { shortExcess: true },
      })
    : [];

  let excess = 0;
  let short = 0;
  for (const r of rows) {
    const se = toNum(r.shortExcess);
    if (se > 0) excess += se;
    else if (se < 0) short += -se;
  }
  const net = excess - short;

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-3 rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border print:hidden">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Staff</span>
            <AutoSubmitSelect
              name="staff"
              defaultValue={selected ? String(selected.id) : ""}
              className="rounded-lg border border-border px-3 py-1.5"
            >
              <option value="">— select —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.active ? "" : " (inactive)"}
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
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
        {ready && <PrintButton />}
      </div>

      {!ready ? (
        <p className="px-1 text-sm text-muted">
          Pick a staff member and a date range to see their short / excess for the period.
        </p>
      ) : (
        <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {selected!.name} · {dayLabel(lo)} – {dayLabel(hi)}
            </h2>
            <p className="text-xs text-muted">
              {rows.length} sheet{rows.length === 1 ? "" : "s"}
            </p>
          </div>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              No sheets for {selected!.name} in this period.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card label="Excess (+)" value={inr(excess)} tone="emerald" />
              <Card label="Short (−)" value={inr(short)} tone="red" />
              <Card
                label={net > 0 ? "Net excess" : net < 0 ? "Net short" : "Net"}
                value={inr(Math.abs(net))}
                tone={net < 0 ? "red" : "emerald"}
              />
            </div>
          )}

          {rows.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              Net = excess − short. A net short is deducted, a net excess is added.
            </p>
          )}
        </section>
      )}
    </div>
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
    <div className="rounded-xl bg-surface-2 p-4 ring-1 ring-border">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          "mt-1 text-2xl font-bold " +
          (tone === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400")
        }
      >
        {value}
      </p>
    </div>
  );
}
