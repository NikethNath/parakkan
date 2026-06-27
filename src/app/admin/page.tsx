import Link from "next/link";
import { prisma } from "@/lib/db";
import { inr, toNum, istDateTimeShort } from "@/lib/format";
import { shortExcessLabel } from "@/lib/calc";

export default async function AdminDashboard() {
  const entries = await prisma.dailyEntry.findMany({
    orderBy: [{ businessDate: "desc" }, { id: "desc" }],
    take: 50,
    include: { employee: { select: { name: true } } },
  });

  const totalShort = entries
    .filter((e) => toNum(e.shortExcess) < 0)
    .reduce((s, e) => s + toNum(e.shortExcess), 0);
  const totalExcess = entries
    .filter((e) => toNum(e.shortExcess) > 0)
    .reduce((s, e) => s + toNum(e.shortExcess), 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Card label="Total excess (recent)" value={inr(totalExcess)} tone="emerald" />
        <Card label="Total short (recent)" value={inr(Math.abs(totalShort))} tone="red" />
      </div>

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          All submissions
        </h2>
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Shift</th>
                  <th className="px-2 py-1.5 font-medium">Employee</th>
                  <th className="px-2 py-1.5 font-medium">Product</th>
                  <th className="px-2 py-1.5 text-right font-medium">Short / Excess</th>
                  <th className="px-2 py-1.5 font-medium">Submitted (IST)</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const se = toNum(e.shortExcess);
                  const lbl = shortExcessLabel(se);
                  return (
                    <tr key={e.id} className="border-t border-border hover:bg-surface-2">
                      <td className="px-2 py-1.5">
                        {e.businessDate.toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </td>
                      <td className="px-2 py-1.5">
                        {e.shift === "MORNING" ? "Morning" : "Evening"}
                      </td>
                      <td className="px-2 py-1.5">{e.employee.name}</td>
                      <td className="px-2 py-1.5">{e.product}</td>
                      <td
                        className={
                          "px-2 py-1.5 text-right font-medium tabular-nums " +
                          (lbl === "SHORT"
                            ? "text-red-600 dark:text-red-400"
                            : lbl === "EXCESS"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted")
                        }
                      >
                        {lbl === "BALANCED" ? "—" : `${lbl} ${inr(Math.abs(se))}`}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted">
                        {istDateTimeShort(e.submittedAt)}
                      </td>
                      <td className="px-2 py-1.5 text-muted">
                        {e.status === "VERIFIED" ? "Verified" : "Submitted"}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Link
                          href={`/admin/entries/${e.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
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
    <div className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          "mt-1 text-2xl font-bold " +
          (tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
        }
      >
        {value}
      </p>
    </div>
  );
}
