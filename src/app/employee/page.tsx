import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TopBar from "@/components/TopBar";
import { inr, toNum } from "@/lib/format";
import { shortExcessLabel } from "@/lib/calc";

export default async function EmployeeHome() {
  const user = await requireUser();
  const entries = await prisma.dailyEntry.findMany({
    where: { employeeId: user.uid },
    orderBy: [{ businessDate: "desc" }, { id: "desc" }],
    take: 30,
    include: { _count: { select: { audits: true } } },
  });

  return (
    <div className="min-h-screen bg-bg">
      <TopBar name={user.name} subtitle="Employee" home="/employee" />
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <Link
          href="/employee/entry"
          className="block rounded-xl bg-accent px-4 py-4 text-center font-semibold text-white shadow-soft transition hover:bg-accent-strong"
        >
          + New daily sheet
        </Link>

        <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            My recent sheets
          </h2>
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              No sheets yet. Tap “New daily sheet” to start.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((e) => {
                const se = toNum(e.shortExcess);
                const lbl = shortExcessLabel(se);
                return (
                  <li key={e.id}>
                    <Link
                      href={`/employee/sheet/${e.id}`}
                      className="-mx-2 flex items-center justify-between rounded-lg px-2 py-2.5 hover:bg-surface-2"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {e.businessDate.toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                          })}{" "}
                          · {e.shift === "MORNING" ? "Morning" : "Evening"} · {e.product}
                        </p>
                        <p className="text-xs text-muted">
                          {e.status === "VERIFIED" ? "Verified by admin" : "Submitted"}
                          {e._count.audits > 0 && (
                            <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
                              · edited by admin
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={
                          "rounded-full px-2.5 py-1 text-xs font-semibold " +
                          (lbl === "SHORT"
                            ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300"
                            : lbl === "EXCESS"
                              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "bg-surface-2 text-muted")
                        }
                      >
                        {lbl === "BALANCED" ? "Balanced" : `${lbl} ${inr(Math.abs(se))}`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
