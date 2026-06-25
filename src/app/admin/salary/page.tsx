import { prisma } from "@/lib/db";
import { inr, toNum, isoDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export default async function SalaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month ?? isoDate(new Date()).slice(0, 7);
  const { start, end } = monthBounds(month);

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: { name: "asc" },
  });

  const attendance = await prisma.attendance.findMany({
    where: { status: "PRESENT", date: { gte: start, lt: end } },
    select: { employeeId: true },
  });
  const entries = await prisma.dailyEntry.findMany({
    where: { businessDate: { gte: start, lt: end } },
    select: { employeeId: true, shortExcess: true },
  });

  const shiftsByEmp = new Map<number, number>();
  for (const a of attendance)
    shiftsByEmp.set(a.employeeId, (shiftsByEmp.get(a.employeeId) ?? 0) + 1);

  const seByEmp = new Map<number, number>();
  for (const e of entries)
    seByEmp.set(e.employeeId, (seByEmp.get(e.employeeId) ?? 0) + toNum(e.shortExcess));

  const rows = employees
    .map((emp) => {
      const shifts = shiftsByEmp.get(emp.id) ?? 0;
      const se = Math.round((seByEmp.get(emp.id) ?? 0) * 100) / 100;
      const shiftRate = toNum(emp.shiftRate);
      const extraPay = toNum(emp.extraPay);
      const basePay =
        emp.payType === "PER_SHIFT" ? shifts * shiftRate : toNum(emp.monthlySalary);
      const netPay = Math.round((basePay + extraPay + se) * 100) / 100;
      return { emp, shifts, shiftRate, se, basePay, extraPay, netPay };
    })
    .filter((r) => r.emp.active || r.shifts > 0 || r.se !== 0);

  const monthLabel = start.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const totalNet = rows.reduce((s, r) => s + r.netPay, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex items-end gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 print:hidden">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Month</span>
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-4 py-1.5 font-medium text-white hover:bg-sky-700"
          >
            Apply
          </button>
        </form>
        <PrintButton />
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-1 text-base font-bold text-slate-800">
          Salary — {monthLabel}
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Net = (shifts present × shift rate) + extra fixed pay + month&apos;s
          short/excess (shorts deducted, excess added).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">Employee</th>
                <th className="px-2 py-1.5 text-right font-medium">Shifts</th>
                <th className="px-2 py-1.5 text-right font-medium">Shift rate</th>
                <th className="px-2 py-1.5 text-right font-medium">Base pay</th>
                <th className="px-2 py-1.5 text-right font-medium">Extra pay</th>
                <th className="px-2 py-1.5 text-right font-medium">Short / Excess</th>
                <th className="px-2 py-1.5 text-right font-medium">Net payable</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-slate-400">
                    No activity this month.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.emp.id} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-medium text-slate-700">
                      {r.emp.name}
                      {!r.emp.active && (
                        <span className="ml-1 text-xs text-slate-400">(inactive)</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.emp.payType === "PER_SHIFT" ? r.shifts : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                      {r.emp.payType === "PER_SHIFT" ? inr(r.shiftRate) : "monthly"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {inr(r.basePay)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                      {r.extraPay > 0 ? inr(r.extraPay) : "—"}
                    </td>
                    <td
                      className={
                        "px-2 py-1.5 text-right tabular-nums " +
                        (r.se < 0
                          ? "text-red-600"
                          : r.se > 0
                            ? "text-emerald-600"
                            : "text-slate-500")
                      }
                    >
                      {r.se === 0
                        ? "—"
                        : (r.se > 0 ? "+" : "−") + inr(Math.abs(r.se)).replace("₹", "₹")}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {inr(r.netPay)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold">
                  <td className="px-2 py-2" colSpan={6}>
                    Total payable
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(totalNet)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </>
  );
}
