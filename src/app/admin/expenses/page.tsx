import { prisma } from "@/lib/db";
import { inr, toNum, isoDate, istToday, dayBoundsUTC, dayLabel } from "@/lib/format";
import AutoSubmitDate from "@/components/AutoSubmitDate";
import MasterListManager from "@/components/MasterListManager";
import OverheadRecorder, { type OverheadRow } from "@/components/OverheadRecorder";

const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

type ExpenseRow = {
  id: number;
  amount: unknown;
  description: string;
  entry: { businessDate: Date; employee: { name: string } };
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();
  // No default range for till expenses — pick a start and end date to load them.
  const hasRange = isDate(sp.from) && isDate(sp.to);
  const fromRaw = isDate(sp.from) ? sp.from! : "";
  const toRaw = isDate(sp.to) ? sp.to! : "";
  const lo = !hasRange ? "" : fromRaw <= toRaw ? fromRaw : toRaw;
  const hi = !hasRange ? "" : fromRaw <= toRaw ? toRaw : fromRaw;

  // Overheads are recorded here, so this section always has something to show:
  // it follows the picked range, and falls back to the current month so the
  // cost you just added is on screen without having to set a filter first.
  const oLo = hasRange ? lo : `${today.slice(0, 7)}-01`;
  const oHi = hasRange ? hi : today;

  const [lines, overheads, categories] = await Promise.all([
    hasRange
      ? prisma.expenseLine.findMany({
          where: {
            entry: { businessDate: { gte: dayBoundsUTC(lo).start, lt: dayBoundsUTC(hi).end } },
          },
          orderBy: [{ entry: { businessDate: "desc" } }, { id: "desc" }],
          select: {
            id: true,
            amount: true,
            description: true,
            entry: { select: { businessDate: true, employee: { select: { name: true } } } },
          },
        })
      : Promise.resolve([] as ExpenseRow[]),
    prisma.outletExpense.findMany({
      where: { billDate: { gte: dayBoundsUTC(oLo).start, lt: dayBoundsUTC(oHi).end } },
      orderBy: [{ billDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        billDate: true,
        note: true,
        amount: true,
        category: { select: { name: true } },
        recordedBy: { select: { name: true } },
      },
    }),
    prisma.outletExpenseCategory.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { expenses: true } } },
    }),
  ]);

  const total = lines.reduce((s, l) => s + toNum(l.amount), 0);
  const overheadRows: OverheadRow[] = overheads.map((o) => ({
    id: o.id,
    date: isoDate(o.billDate),
    category: o.category.name,
    note: o.note,
    amount: toNum(o.amount),
    recordedBy: o.recordedBy?.name ?? null,
  }));

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

      <OverheadRecorder
        categories={categories.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }))}
        items={overheadRows}
        from={oLo}
        to={oHi}
        today={today}
      />

      {!hasRange ? (
        <p className="px-1 text-sm text-muted">
          Pick a start and end date to see the till expenses for that period.
        </p>
      ) : (
        <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Till expenses · {dayLabel(lo)} – {dayLabel(hi)}
            </h2>
            <p className="text-xs text-muted">
              {lines.length} {lines.length === 1 ? "entry" : "entries"} · {inr(total)} total
            </p>
          </div>
          <p className="mb-3 text-xs text-faint">
            Money staff took out of the drawer during a shift, so these do count towards
            that sheet&apos;s short or excess.
          </p>
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">No till expenses in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    <th className="px-2 py-1.5 font-medium">Staff</th>
                    <th className="px-2 py-1.5 font-medium">Description</th>
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
                      <td className="px-2 py-1.5 text-foreground">{l.description}</td>
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
      )}

      <MasterListManager
        title="Overhead categories"
        endpoint="/api/outlet-expense-categories"
        noun="category"
        items={categories.map((c) => ({
          id: c.id,
          name: c.name,
          active: c.active,
          count: c._count.expenses,
        }))}
      />
    </div>
  );
}
