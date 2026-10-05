import { inr, dayLabel } from "@/lib/format";
import type { OverheadItem } from "@/lib/summary";

/**
 * Read-only view of the outlet's own running costs for a period — electricity,
 * taxes, licence fees. Shown on the accountant's summary and the admin Summary
 * tab; recording and removing them happens on the admin Expenses tab.
 *
 * Kept as its own panel rather than folded into the daily table because the
 * useful part is *what* the money was, which a per-day column can't say.
 */
export default function OverheadsPanel({
  items,
  from,
  to,
}: {
  items: OverheadItem[];
  from: string;
  to: string;
}) {
  const total = items.reduce((s, i) => s + i.amount, 0);

  const byCategory = new Map<string, number>();
  for (const i of items) byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.amount);
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Outlet overheads · {dayLabel(from)} – {dayLabel(to)}
        </h2>
        <p className="text-xs text-muted">
          {items.length} {items.length === 1 ? "cost" : "costs"} · {inr(total)} total
        </p>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">
          No outlet overheads recorded in this period.
        </p>
      ) : (
        <>
          {categories.length > 1 && (
            <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {categories.map(([name, amount]) => (
                <li key={name}>
                  {name} <span className="font-medium tabular-nums text-foreground">{inr(amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Category</th>
                  <th className="px-2 py-1.5 font-medium">Note</th>
                  <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted">{dayLabel(i.date)}</td>
                    <td className="px-2 py-1.5 font-medium text-foreground">{i.category}</td>
                    <td className="px-2 py-1.5 text-muted">{i.note || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inr(i.amount)}</td>
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
        </>
      )}
      <p className="mt-2 text-xs text-faint">
        The outlet&apos;s own running costs. This money never passed through a shift&apos;s
        till, so it is not part of any staff member&apos;s short or excess.
      </p>
    </section>
  );
}
