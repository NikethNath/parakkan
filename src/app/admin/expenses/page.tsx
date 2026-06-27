import { prisma } from "@/lib/db";
import { inr, toNum, istDateTimeShort } from "@/lib/format";
import MasterListManager from "@/components/MasterListManager";
import ClassifySelect from "@/components/ClassifySelect";

export default async function ExpensesPage() {
  const [buckets, lines] = await Promise.all([
    prisma.expenseBucket.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { expenseLines: true } } },
    }),
    prisma.expenseLine.findMany({
      orderBy: { entry: { submittedAt: "desc" } },
      take: 300,
      include: {
        entry: {
          select: {
            businessDate: true,
            submittedAt: true,
            shift: true,
            employee: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const options = buckets
    .filter((b) => b.active)
    .map((b) => ({ id: b.id, name: b.name }));

  const total = lines.reduce((s, l) => s + toNum(l.amount), 0);
  const unassigned = lines.filter((l) => l.bucketId == null).length;

  return (
    <div className="space-y-4 pb-6">
      <MasterListManager
        title="Expense buckets"
        endpoint="/api/expense-buckets"
        noun="bucket"
        flagField="isSalaryAdvance"
        flagLabel="Salary advance?"
        items={buckets.map((b) => ({
          id: b.id,
          name: b.name,
          active: b.active,
          count: b._count.expenseLines,
          flag: b.isSalaryAdvance,
        }))}
      />
      <p className="-mt-2 px-1 text-xs text-muted">
        Tip: mark a bucket as <strong>Salary advance</strong> for draws staff take from the
        collection. Those still balance the day, but are netted out of pay on the Salary page.
      </p>

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Expenses from staff
          </h2>
          <p className="text-xs text-muted">
            {lines.length} entries · {inr(total)} total
            {unassigned > 0 && (
              <span className="text-amber-600 dark:text-amber-400"> · {unassigned} unassigned</span>
            )}
          </p>
        </div>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">No expenses yet.</p>
        ) : (
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
        )}
      </section>
    </div>
  );
}
