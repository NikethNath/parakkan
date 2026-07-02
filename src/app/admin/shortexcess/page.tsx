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

  // Sheets this person filled themselves…
  const own = ready
    ? await prisma.dailyEntry.findMany({
        where: {
          employeeId: selected!.id,
          businessDate: { gte: dayBoundsUTC(lo).start, lt: dayBoundsUTC(hi).end },
        },
        select: { shortExcess: true, partnerId: true },
      })
    : [];
  // …and sheets where they were the partner on someone else's unit.
  const partnered = ready
    ? await prisma.dailyEntry.findMany({
        where: {
          partnerId: selected!.id,
          businessDate: { gte: dayBoundsUTC(lo).start, lt: dayBoundsUTC(hi).end },
        },
        select: { shortExcess: true },
      })
    : [];

  // A person's share of a sheet is the full short/excess when they worked it
  // solo, or half when it was shared with a partner.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let excess = 0;
  let short = 0;
  const addShare = (share: number) => {
    if (share > 0) excess += share;
    else if (share < 0) short += -share;
  };
  for (const r of own) addShare(r.partnerId ? toNum(r.shortExcess) / 2 : toNum(r.shortExcess));
  for (const r of partnered) addShare(toNum(r.shortExcess) / 2);
  excess = round2(excess);
  short = round2(short);
  const net = round2(excess - short);

  const sheetCount = own.length + partnered.length;
  const sharedCount = own.filter((r) => r.partnerId).length + partnered.length;

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
              {sheetCount} sheet{sheetCount === 1 ? "" : "s"}
              {sharedCount > 0 ? ` · ${sharedCount} shared (split 50/50)` : ""}
            </p>
          </div>

          {sheetCount === 0 ? (
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

          {sheetCount > 0 && (
            <p className="mt-3 text-xs text-muted">
              Net = excess − short. A net short is deducted, a net excess is added.
              Sheets shared with a partner count only this person&apos;s half.
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
