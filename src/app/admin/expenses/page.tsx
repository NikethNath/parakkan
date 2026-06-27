import { prisma } from "@/lib/db";
import { inr, toNum, istDateTimeShort, istToday, dayBoundsUTC, dayLabel } from "@/lib/format";
import MasterListManager from "@/components/MasterListManager";
import ClassifySelect from "@/components/ClassifySelect";
import DayFilter from "@/components/DayFilter";

type Option = { id: number; name: string };
type ExpenseRow = {
  id: number;
  amount: unknown;
  description: string;
  bucketId: number | null;
  entry: { submittedAt: Date; employee: { name: string } };
};

function ExpenseTable({ lines, options }: { lines: ExpenseRow[]; options: Option[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-2 py-1.5 font-medium">Submitted (IST)</th>
            <th className="px-2 py-1.5 font-medium">Staff</th>
            <th className="px-2 py-1.5 font-medium">Description</th>
            <th className="px-2 py-1.5 text-right font-medium">Amount</th>
            <th className="px-2 py-1.5 font-medium">Bucket</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t border-border">
              <td className="whitespace-nowrap px-2 py-1.5 text-xs text-muted">
                {istDateTimeShort(l.entry.submittedAt)}
              </td>
              <td className="px-2 py-1.5">{l.entry.employee.name}</td>
              <td className="px-2 py-1.5 text-foreground">{l.description}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{inr(toNum(l.amount))}</td>
              <td className="px-2 py-1.5">
                <ClassifySelect
                  endpoint={`/api/expense-lines/${l.id}`}
                  field="bucketId"
                  current={l.bucketId}
                  options={options}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const today = istToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const { start, end } = dayBoundsUTC(date);

  const lineInclude = {
    entry: { select: { submittedAt: true, employee: { select: { name: true } } } },
  } as const;

  const [buckets, dayLines, unassignedLines] = await Promise.all([
    prisma.expenseBucket.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { expenseLines: true } } },
    }),
    prisma.expenseLine.findMany({
      where: { entry: { businessDate: { gte: start, lt: end } } },
      orderBy: { entry: { submittedAt: "desc" } },
      include: lineInclude,
    }),
    prisma.expenseLine.findMany({
      where: { bucketId: null },
      orderBy: { entry: { submittedAt: "desc" } },
      take: 200,
      include: lineInclude,
    }),
  ]);

  const options = buckets.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }));
  const dayTotal = dayLines.reduce((s, l) => s + toNum(l.amount), 0);

  return (
    <div className="space-y-4 pb-6">
      <MasterListManager
        title="Expense buckets"
        endpoint="/api/expense-buckets"
        noun="bucket"
        items={buckets.map((b) => ({
          id: b.id,
          name: b.name,
          active: b.active,
          count: b._count.expenseLines,
        }))}
      />

      <DayFilter date={date} today={today} />

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Unassigned — needs a bucket
          </h2>
          <p className="text-xs text-muted">{unassignedLines.length} waiting</p>
        </div>
        {unassignedLines.length === 0 ? (
          <p className="py-4 text-center text-sm text-faint">Nothing waiting — all expenses are classified.</p>
        ) : (
          <ExpenseTable lines={unassignedLines} options={options} />
        )}
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Expenses · {dayLabel(date)}
          </h2>
          <p className="text-xs text-muted">
            {dayLines.length} entries · {inr(dayTotal)} total
          </p>
        </div>
        {dayLines.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">No expenses on {dayLabel(date)}.</p>
        ) : (
          <ExpenseTable lines={dayLines} options={options} />
        )}
      </section>
    </div>
  );
}
