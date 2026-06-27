import { prisma } from "@/lib/db";
import { inr, toNum, isoDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import SalaryPaymentCell, { type Payment } from "@/components/SalaryPaymentCell";

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export default async function SalaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month ?? isoDate(new Date()).slice(0, 7);
  const { start, end } = monthBounds(month);

  const [employees, attendance, entries, advanceLines, paymentRows] = await Promise.all([
    prisma.user.findMany({ where: { role: "EMPLOYEE" }, orderBy: { name: "asc" } }),
    prisma.attendance.findMany({
      where: { status: "PRESENT", date: { gte: start, lt: end } },
      select: { employeeId: true },
    }),
    prisma.dailyEntry.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: { employeeId: true, shortExcess: true },
    }),
    // Salary draws staff took from the collection (expense lines in a bucket
    // flagged as "salary advance"), attributed to whoever's sheet they're on.
    prisma.expenseLine.findMany({
      where: {
        bucket: { isSalaryAdvance: true },
        entry: { businessDate: { gte: start, lt: end } },
      },
      select: { amount: true, entry: { select: { employeeId: true } } },
    }),
    // Payments / advances the admin recorded directly for this month.
    prisma.salaryPayment.findMany({
      where: { month },
      orderBy: { paidAt: "asc" },
      select: { id: true, employeeId: true, amount: true, note: true },
    }),
  ]);

  const shiftsByEmp = new Map<number, number>();
  for (const a of attendance)
    shiftsByEmp.set(a.employeeId, (shiftsByEmp.get(a.employeeId) ?? 0) + 1);

  const seByEmp = new Map<number, number>();
  for (const e of entries)
    seByEmp.set(e.employeeId, (seByEmp.get(e.employeeId) ?? 0) + toNum(e.shortExcess));

  const advByEmp = new Map<number, number>();
  for (const l of advanceLines)
    advByEmp.set(l.entry.employeeId, (advByEmp.get(l.entry.employeeId) ?? 0) + toNum(l.amount));

  const payByEmp = new Map<number, Payment[]>();
  for (const p of paymentRows) {
    const arr = payByEmp.get(p.employeeId) ?? [];
    arr.push({ id: p.id, amount: toNum(p.amount), note: p.note });
    payByEmp.set(p.employeeId, arr);
  }

  const rows = employees
    .map((emp) => {
      const shifts = shiftsByEmp.get(emp.id) ?? 0;
      const se = r2(seByEmp.get(emp.id) ?? 0);
      const shiftRate = toNum(emp.shiftRate);
      const extraPay = toNum(emp.extraPay);
      const basePay = emp.payType === "PER_SHIFT" ? shifts * shiftRate : toNum(emp.monthlySalary);
      const earned = r2(basePay + extraPay + se);
      const advances = r2(advByEmp.get(emp.id) ?? 0);
      const pays = payByEmp.get(emp.id) ?? [];
      const paid = r2(pays.reduce((s, p) => s + p.amount, 0));
      const stillOwed = r2(earned - advances - paid);
      return { emp, shifts, se, basePay, extraPay, earned, advances, pays, paid, stillOwed };
    })
    .filter(
      (r) =>
        r.emp.active || r.shifts > 0 || r.se !== 0 || r.advances > 0 || r.paid > 0,
    );

  const monthLabel = start.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const totalOwed = rows.reduce((s, r) => s + r.stillOwed, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex items-end gap-3 rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border print:hidden">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Month</span>
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border border-border px-3 py-1.5"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-1.5 font-medium text-white hover:bg-accent-strong"
          >
            Apply
          </button>
        </form>
        <PrintButton />
      </div>

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <h2 className="mb-1 text-base font-bold text-foreground">Salary — {monthLabel}</h2>
        <p className="mb-3 text-xs text-muted">
          Earned = (shifts × rate or monthly) + extra ± month&apos;s short/excess. Still owed =
          Earned − advances drawn from the collection (Salary-advance bucket) − payments recorded
          here. Record a payment to settle, or to log an advance you handed over directly.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">Employee</th>
                <th className="px-2 py-1.5 text-right font-medium">Shifts</th>
                <th className="px-2 py-1.5 text-right font-medium">Base</th>
                <th className="px-2 py-1.5 text-right font-medium">Extra</th>
                <th className="px-2 py-1.5 text-right font-medium">Short / Excess</th>
                <th className="px-2 py-1.5 text-right font-medium">Earned</th>
                <th className="px-2 py-1.5 text-right font-medium">Drawn (sheets)</th>
                <th className="px-2 py-1.5 text-right font-medium">Paid / recorded</th>
                <th className="px-2 py-1.5 text-right font-medium">Still owed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 py-6 text-center text-faint">
                    No activity this month.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.emp.id} className="border-t border-border align-top">
                    <td className="px-2 py-1.5 font-medium text-foreground">
                      {r.emp.name}
                      {!r.emp.active && <span className="ml-1 text-xs text-faint">(inactive)</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.emp.payType === "PER_SHIFT" ? r.shifts : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inr(r.basePay)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                      {r.extraPay > 0 ? inr(r.extraPay) : "—"}
                    </td>
                    <td
                      className={
                        "px-2 py-1.5 text-right tabular-nums " +
                        (r.se < 0
                          ? "text-red-600 dark:text-red-400"
                          : r.se > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted")
                      }
                    >
                      {r.se === 0 ? "—" : (r.se > 0 ? "+" : "−") + inr(Math.abs(r.se))}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                      {inr(r.earned)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                      {r.advances > 0 ? `−${inr(r.advances)}` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <SalaryPaymentCell
                        employeeId={r.emp.id}
                        month={month}
                        payments={r.pays}
                        suggested={r.stillOwed}
                      />
                    </td>
                    <td
                      className={
                        "px-2 py-1.5 text-right font-semibold tabular-nums " +
                        (r.stillOwed > 0 ? "text-foreground" : "text-emerald-600 dark:text-emerald-400")
                      }
                    >
                      {inr(r.stillOwed)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-2 py-2" colSpan={8}>
                    Total still owed
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totalOwed)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </>
  );
}
