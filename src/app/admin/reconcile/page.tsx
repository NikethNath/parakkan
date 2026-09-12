import { prisma } from "@/lib/db";
import { inr, toNum, isoDate } from "@/lib/format";
import { bankFigureAt, bankFigureSelect, sumBankFigures } from "@/lib/bankFigures";
import BankReconcile, { type Day, type Side } from "@/components/BankReconcile";
import ReconcileImport from "@/components/ReconcileImport";
import AutoSubmitDate from "@/components/AutoSubmitDate";

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

const TOLERANCE = 6; // ₹ — matches TOL in BankReconcile

export default async function ReconcilePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month ?? isoDate(new Date()).slice(0, 7);
  const { start, end } = monthBounds(month);

  const [bankTxns, entries, bankCount] = await Promise.all([
    prisma.bankTxn.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: bankFigureSelect,
    }),
    prisma.dailyEntry.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: { businessDate: true, gpay: true, pos: true },
    }),
    prisma.bankTxn.count(),
  ]);

  // Providers add up for a day; only the bank's own Paytm credit steps aside
  // once the Paytm report covers that day — see src/lib/bankFigures.ts.
  const figures = sumBankFigures(bankTxns);

  const enteredByDay = new Map<string, { gpay: number; pos: number }>();
  for (const e of entries) {
    const d = isoDate(e.businessDate);
    const r = enteredByDay.get(d) ?? { gpay: 0, pos: 0 };
    r.gpay += toNum(e.gpay);
    r.pos += toNum(e.pos);
    enteredByDay.set(d, r);
  }

  const dates = [
    ...new Set([...enteredByDay.keys(), ...bankTxns.map((t) => isoDate(t.businessDate))]),
  ].sort();

  const side = (date: string, channel: "GPAY" | "POS", entered: number): Side => {
    const f = bankFigureAt(figures, date, channel);
    return { bank: f ? f.amount : null, fromReport: f?.fromReport ?? false, entered };
  };

  const days: Day[] = dates.map((date) => {
    const staff = enteredByDay.get(date) ?? { gpay: 0, pos: 0 };
    return {
      date,
      gpay: side(date, "GPAY", staff.gpay),
      pos: side(date, "POS", staff.pos),
    };
  });

  // Days with nothing recorded yet — the Paytm report hasn't been imported for
  // them, so there is nothing to reconcile against.
  const pending = days.filter((d) => d.gpay.bank === null || d.pos.bank === null).length;

  const monthLabel = start.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <ReconcileImport />

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Reconciliation — {monthLabel}</h2>
            <p className="text-xs text-muted">
              Δ = entered by staff − received. Off by &gt; {inr(TOLERANCE)} is flagged.
            </p>
            {pending > 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {pending} day{pending === 1 ? "" : "s"} have no figures yet — import the
                Paytm report, and the bank statement for PhonePe money, covering them.
              </p>
            )}
            <p className="mt-1 text-xs text-muted">
              {bankCount} figure{bankCount === 1 ? "" : "s"} stored for this outlet.
            </p>
          </div>
          <form className="flex items-end gap-2">
            <AutoSubmitDate
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
            />
          </form>
        </div>

        <div className="mt-3">
          <BankReconcile days={days} />
        </div>
      </section>
    </>
  );
}

