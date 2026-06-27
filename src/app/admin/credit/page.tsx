import { prisma } from "@/lib/db";
import { inr, toNum, istDateTimeShort } from "@/lib/format";
import MasterListManager from "@/components/MasterListManager";
import ClassifySelect from "@/components/ClassifySelect";

export default async function CreditPage() {
  const [creditors, lines] = await Promise.all([
    prisma.creditor.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { creditLines: true } } },
    }),
    prisma.creditLine.findMany({
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

  const options = creditors
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name }));

  const total = lines.reduce((s, l) => s + toNum(l.amount), 0);
  const unassigned = lines.filter((l) => l.creditorId == null).length;

  return (
    <div className="space-y-4 pb-6">
      <MasterListManager
        title="Creditors (khata accounts)"
        endpoint="/api/creditors"
        withContact
        noun="creditor"
        items={creditors.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          notes: c.notes,
          active: c.active,
          count: c._count.creditLines,
        }))}
      />

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Credit entries from staff
          </h2>
          <p className="text-xs text-muted">
            {lines.length} entries · {inr(total)} total
            {unassigned > 0 && (
              <span className="text-amber-600 dark:text-amber-400"> · {unassigned} unassigned</span>
            )}
          </p>
        </div>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">No credit entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Submitted (IST)</th>
                  <th className="px-2 py-1.5 font-medium">Staff</th>
                  <th className="px-2 py-1.5 font-medium">Customer (typed)</th>
                  <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                  <th className="px-2 py-1.5 font-medium">Creditor</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs text-muted">
                      {istDateTimeShort(l.entry.submittedAt)}
                    </td>
                    <td className="px-2 py-1.5">{l.entry.employee.name}</td>
                    <td className="px-2 py-1.5 text-foreground">{l.customer}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inr(toNum(l.amount))}</td>
                    <td className="px-2 py-1.5">
                      <ClassifySelect
                        endpoint={`/api/credit-lines/${l.id}`}
                        field="creditorId"
                        current={l.creditorId}
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
