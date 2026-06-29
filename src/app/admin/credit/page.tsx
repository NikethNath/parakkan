import { prisma } from "@/lib/db";
import { inr, toNum, istToday, dayBoundsUTC, dayLabel } from "@/lib/format";
import AutoSubmitDate from "@/components/AutoSubmitDate";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

type CreditRow = {
  id: number;
  amount: unknown;
  customer: string;
  entry: { businessDate: Date; employee: { name: string } };
};

export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();
  // Default to this month so far; pick any start/end range above.
  const fromRaw = isDate(sp.from) ? sp.from! : today.slice(0, 8) + "01";
  const toRaw = isDate(sp.to) ? sp.to! : today;
  const lo = fromRaw <= toRaw ? fromRaw : toRaw;
  const hi = fromRaw <= toRaw ? toRaw : fromRaw;
  const start = dayBoundsUTC(lo).start;
  const end = dayBoundsUTC(hi).end;

  const lines: CreditRow[] = await prisma.creditLine.findMany({
    where: { entry: { businessDate: { gte: start, lt: end } } },
    orderBy: [{ entry: { businessDate: "desc" } }, { id: "desc" }],
    select: {
      id: true,
      amount: true,
      customer: true,
      entry: { select: { businessDate: true, employee: { select: { name: true } } } },
    },
  });

  const total = lines.reduce((s, l) => s + toNum(l.amount), 0);

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
      </form>

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Credit · {dayLabel(lo)} – {dayLabel(hi)}
          </h2>
          <p className="text-xs text-muted">
            {lines.length} {lines.length === 1 ? "entry" : "entries"} · {inr(total)} total
          </p>
        </div>
        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">No credit in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Staff</th>
                  <th className="px-2 py-1.5 font-medium">Customer</th>
                  <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                      {l.entry.businessDate.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </td>
                    <td className="px-2 py-1.5">{l.entry.employee.name}</td>
                    <td className="px-2 py-1.5 text-foreground">{l.customer}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inr(toNum(l.amount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-2 py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
